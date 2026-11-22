// The November 2025 flight-cut analysis: the order's facts, the counting rules, the analysis on known
// inputs, and the saved outputs in data/aviation-shutdown agreeing with each other and with the code.
// Run: node --test pipelines/aviation-shutdown/shutdown.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HIGH_IMPACT, APPLIED_CUTS, cutOn, exposure, isListed } from './order.mjs';
import { splitCsvLine, csvMember, parseFlight, addFlight, newTotals, aggregate, toCsv, TOTALS, MONTHS } from './extract.mjs';
import { readDaily, rates, analyse, PERIODS } from './analyse.mjs';

const data = (f) => readFileSync(new URL(`../../data/aviation-shutdown/${f}`, import.meta.url), 'utf8');

test('the order lists 40 airports and the cut in force follows the steps as applied', () => {
  assert.equal(new Set(HIGH_IMPACT).size, 40);
  for (const code of HIGH_IMPACT) assert.match(code, /^[A-Z]{3}$/);
  assert.ok(isListed('ATL') && isListed('TEB') && !isListed('BNA'));
  const cases = { '2025-11-06': 0, '2025-11-07': 4, '2025-11-10': 4, '2025-11-11': 6, '2025-11-14': 6, '2025-11-15': 3, '2025-11-16': 3, '2025-11-17': 0 };
  for (const [date, cut] of Object.entries(cases)) assert.equal(cutOn(date), cut, date);
  assert.ok(APPLIED_CUTS.every((s) => s.cut < 8), 'the 8% and 10% steps never took effect');
  assert.equal(exposure('ATL', 'ORD'), 'both');
  assert.equal(exposure('BNA', 'ORD'), 'one');
  assert.equal(exposure('ATL', 'BNA'), 'one');
  assert.equal(exposure('BNA', 'AUS'), 'none');
});

test('CSV lines split on commas outside quotes, and the archive yields its one CSV', () => {
  assert.deepEqual(splitCsvLine('2025,"Atlanta, GA","",1.00,'), ['2025', 'Atlanta, GA', '', '1.00', '']);
  assert.deepEqual(splitCsvLine('"say ""hi""",x'), ['say "hi"', 'x']);
  assert.equal(csvMember('readme.html\nOn_Time_2025_11.csv\n'), 'On_Time_2025_11.csv');
  assert.throws(() => csvMember('readme.html\n'), /one CSV/);
  assert.throws(() => csvMember('a.csv\nb.csv\n'), /one CSV/);
});

test('flights count by the metric contract: cancelled and diverted are not observed arrivals', () => {
  const idx = { FlightDate: 0, Origin: 1, Dest: 2, Cancelled: 3, CancellationCode: 4, Diverted: 5, ArrDelay: 6 };
  const f = (row) => parseFlight(row, idx);
  const t = newTotals();
  addFlight(t, f(['2025-11-09', 'ATL', 'ORD', '1.00', 'C', '0.00', '']));
  addFlight(t, f(['2025-11-09', 'ATL', 'ORD', '1.00', 'A', '0.00', '']));
  addFlight(t, f(['2025-11-09', 'ATL', 'ORD', '0.00', '', '1.00', '']));
  addFlight(t, f(['2025-11-09', 'ATL', 'ORD', '0.00', '', '0.00', '']));
  addFlight(t, f(['2025-11-09', 'ATL', 'ORD', '0.00', '', '0.00', '14.00']));
  addFlight(t, f(['2025-11-09', 'ATL', 'ORD', '0.00', '', '0.00', '15.00']));
  addFlight(t, f(['2025-11-09', 'ATL', 'ORD', '0.00', '', '0.00', '-6.00']));
  assert.deepEqual(t, {
    scheduled: 7, cancelled: 2, cancelled_nas: 1, diverted: 1, observed_arrivals: 3, on_time: 2,
    arrival_delay_sum: 23, positive_delay_sum: 29,
  });
});

test('daily totals round-trip through the CSV the analysis reads', () => {
  const flights = [
    { date: '2025-11-07', origin: 'ATL', dest: 'ORD', cancelled: true, code: 'C', diverted: false, arrDelay: null },
    { date: '2025-11-07', origin: 'BNA', dest: 'AUS', cancelled: false, code: '', diverted: false, arrDelay: 20 },
  ];
  const map = aggregate(flights, (f) => exposure(f.origin, f.dest));
  const rows = readDaily(toCsv(map, 'exposure', (date) => ({ cut: cutOn(date) })));
  assert.deepEqual(rows.map((r) => [r.date, r.exposure, r.cut, r.scheduled, r.cancelled]), [
    ['2025-11-07', 'both', 4, 1, 1], ['2025-11-07', 'none', 4, 1, 0],
  ]);
});

test('the analysis gives the expected answers on made-up days', () => {
  const day = (date, exposureName, scheduled, cancelled) => ({
    date, exposure: exposureName, cut: cutOn(date), ...newTotals(), scheduled, cancelled,
    observed_arrivals: scheduled - cancelled, on_time: scheduled - cancelled, arrival_delay_sum: 0,
  });
  const daily = [];
  for (const date of ['2025-10-10', '2025-10-17', '2025-10-24', '2025-10-31']) {
    daily.push(day(date, 'both', 100, 1), day(date, 'one', 100, 1), day(date, 'none', 100, 1));
  }
  daily.push(day('2025-11-07', 'both', 90, 9), day('2025-11-07', 'one', 100, 5), day('2025-11-07', 'none', 100, 1));
  const r = analyse(daily);
  const did = Object.fromEntries(r.difference_in_differences.map((d) => [d.group, d]));
  assert.ok(Math.abs(did.both.difference_pp - 9) < 1e-9, '10% - 1% for the exposed, 0 change for the rest');
  assert.ok(Math.abs(did.one.difference_pp - 4) < 1e-9);
  const both = r.scheduled_against_weekday.find((s) => s.group === 'both');
  assert.ok(Math.abs(both.change - -0.1) < 1e-9, 'a Friday with 90 flights against four Fridays of 100');
  assert.equal(r.by_cut.find((c) => c.cut === 4).exposed.cancelled, 14);
  assert.equal(r.level_of_detail.peak_day.date, '2025-11-07');
});

test('the saved outputs agree with each other and with the code', () => {
  const daily = readDaily(data('daily-exposure.csv'));
  const airports = readDaily(data('daily-airport.csv'));
  const extract = JSON.parse(data('extract.json'));
  const results = JSON.parse(data('results.json'));
  const dates = [...new Set(daily.map((r) => r.date))].sort();
  assert.equal(dates[0], '2025-09-01');
  assert.equal(dates.at(-1), '2025-11-30');
  assert.equal(dates.length, 91);
  assert.equal(daily.length, 91 * 3, 'every day has all three exposure groups');
  for (const r of [...daily, ...airports]) assert.equal(r.cut, cutOn(r.date), r.date);
  for (const date of dates) {
    const a = rates(daily.filter((r) => r.date === date));
    const b = rates(airports.filter((r) => r.date === date));
    for (const k of TOTALS) assert.equal(a[k], b[k], `${date} ${k}: groups and origins count each flight once`);
  }
  assert.deepEqual(extract.files.map((f) => f.period), MONTHS.map(([y, m]) => `${y}-${String(m).padStart(2, '0')}`));
  for (const f of extract.files) {
    assert.equal(rates(daily.filter((r) => r.date.startsWith(f.period))).scheduled, f.rows, `${f.period}: every row counted`);
    assert.match(f.sha256, /^[0-9a-f]{64}$/);
  }
  assert.deepEqual(extract.high_impact, [...HIGH_IMPACT]);
  assert.deepEqual(results, JSON.parse(JSON.stringify(analyse(daily))), 'results.json is what analyse.mjs computes');
  assert.deepEqual(results.periods.map((p) => p.key), PERIODS.map((p) => p.key));
});
