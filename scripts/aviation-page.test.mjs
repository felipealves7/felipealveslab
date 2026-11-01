// Tests for the figures, charts and code cells on /lab/aviation-reliability, pinned to the saved files
// in data/aviation-reliability/. Run: node --test scripts/aviation-page.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  parseMonths, sum, value, overview, matched, checkAgainstSaved, reconcile, headline, changeBars,
  parseHistogram, binLabel, lineChart, histogramChart, niceTicks, fmtChange, fmtRelative, fmtValue, METRIC_ORDER,
} from '../src/lib/aviation/metrics.mjs';
import { STAGES, excerpt, sourceSummary } from '../src/lib/aviation/notebook.mjs';

const dir = fileURLToPath(new URL('../data/aviation-reliability/', import.meta.url));
const read = (f) => readFileSync(dir + f, 'utf8');
const json = (f) => JSON.parse(read(f));
const rows = parseMonths(read('mart_month.csv'));

test('the monthly totals cover 20 months and 11,730,351 scheduled flights', () => {
  const o = overview(rows);
  assert.equal(o.months, 20);
  assert.equal(o.flights, 11730351);
  assert.equal(o.from, '2025-01');
  assert.equal(o.to, '2026-08');
});

test('January to August of both years matches the saved analysis, count by count', () => {
  const m = matched(rows);
  assert.deepEqual(m.years, [2025, 2026]);
  assert.deepEqual(m.months, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(checkAgainstSaved(m, json('cached-results.json')), true);
  assert.equal(m.before.scheduled, 4680482);
  assert.equal(m.after.scheduled, 4728732);
});

test('a single changed count stops the build', () => {
  const saved = json('cached-results.json');
  saved.jan_aug_2026.cancelled += 1;
  assert.throws(() => checkAgainstSaved(matched(rows), saved), /cancelled, 2026/);
});

test('the headline numbers', () => {
  const h = headline(matched(rows));
  assert.equal(h.span, 'Jan–Aug');
  assert.equal(h.delayBefore, '9.33 min');
  assert.equal(h.delayAfter, '9.33 min');
  assert.equal(h.delayChange, '−0.01 min');
  assert.equal(h.cancBefore, '1.57%');
  assert.equal(h.cancAfter, '2.20%');
  assert.equal(h.cancRelative, '+40%');
  assert.equal(h.succChange, '−1.13 pts');
});

test('rates are sums divided by sums, and an empty denominator gives null', () => {
  const t = sum(rows.filter((r) => r.year === 2026));
  assert.equal(value(t, 'cancellation_rate'), t.cancelled / t.scheduled);
  assert.equal(value({ ...t, scheduled: 0 }, 'cancellation_rate'), null);
  assert.equal(fmtValue('arrival_otp', null), 'n/a');
});

test('180 of 180 monthly totals match the counts taken straight from the BTS files', () => {
  const r = reconcile(rows, json('independent-raw-totals.json'));
  assert.equal(r.comparisons, 180);
  assert.equal(r.matched, 180);
  assert.deepEqual(r.mismatches, []);
  const tampered = json('independent-raw-totals.json');
  tampered[3].on_time += 1;
  const bad = reconcile(rows, tampered);
  assert.equal(bad.matched, 179);
  assert.deepEqual(bad.mismatches, ['2025-04: on_time']);
});

test('malformed monthly totals are refused', () => {
  const text = read('mart_month.csv');
  assert.throws(() => parseMonths(text.replace('2025-01,2025,1,539747', '2025-01,2025,1,539748')), /do not add up/);
  assert.throws(() => parseMonths(text.replace('source_period', 'period')), /lack the column/);
  const lines = text.trim().split('\n');
  assert.throws(() => parseMonths([...lines, lines[1]].join('\n')), /appears twice/);
});

test('change formatting uses points for rates and minutes for averages', () => {
  assert.equal(fmtChange('cancellation_rate', 0.01572, 0.02198), '+0.63 pts');
  assert.equal(fmtChange('mean_positive_delay', 17.98, 18.46), '+0.48 min');
  assert.equal(fmtChange('mean_signed_delay', 9.3319, 9.3261, 2), '−0.01 min');
  assert.equal(fmtChange('mean_signed_delay', 9.331, 9.329, 2), 'no change at 2 decimals');
  assert.equal(fmtRelative(2, 3), '+50.0%');
});

test('the Lab card bars show each measure as a change from the year before, scaled to the largest', () => {
  const bars = changeBars(matched(rows));
  assert.deepEqual(bars.map((b) => b.key), METRIC_ORDER);
  const canc = bars.find((b) => b.key === 'cancellation_rate');
  assert.equal(canc.percent, 100);
  assert.equal(canc.text, '+39.8%');
  assert.ok(bars.every((b) => Math.abs(b.percent) <= 100));
  assert.ok(Math.abs(bars.find((b) => b.key === 'mean_signed_delay').change) < 0.1);
});

test('the delay histogram holds every observed arrival, in contiguous 15-minute bins', () => {
  const bins = parseHistogram(read('delay_histogram.csv'));
  assert.equal(bins.length, 16);
  assert.equal(bins.reduce((n, b) => n + b.flights, 0), overview(rows).observed);
  assert.equal(binLabel(-60), 'More than 30 min early');
  assert.equal(binLabel(-15), '1–15 min early');
  assert.equal(binLabel(0), 'On time to 14 min late');
  assert.equal(binLabel(15), '15–29 min late');
  assert.equal(binLabel(180), '180 min or more late');
  assert.equal(bins.filter((b) => b.late).length, 12);
  assert.throws(() => parseHistogram('bin_start,flights\n0,1\n15,2'), /expected 15-minute bins/);
});

test('chart geometry stays inside the plot', () => {
  for (const key of METRIC_ORDER) {
    const c = lineChart(rows, key);
    assert.deepEqual(c.series.map((s) => s.points.length), [12, 8]);
    for (const p of c.series.flatMap((s) => s.points)) {
      assert.ok(p.cx >= c.plot.left && p.cx <= c.plot.right, `${key} x`);
      assert.ok(p.cy >= c.plot.top && p.cy <= c.plot.bottom, `${key} y`);
    }
    assert.equal(c.columns.length, 12);
    assert.equal(c.columns[11].values[1].text, 'no data yet');
  }
  const h = histogramChart(parseHistogram(read('delay_histogram.csv')));
  assert.ok(h.bars.every((b) => b.width <= 24 && b.y >= h.plot.top && b.y + b.height <= h.plot.bottom + 0.01));
  assert.ok(h.boundaryX > h.plot.left && h.boundaryX < h.plot.right);
  assert.deepEqual(niceTicks(0, 4, 4).ticks, [0, 1, 2, 3, 4]);
});

test('every code cell shows lines from a byte-identical copy of the code that ran', () => {
  const sums = json('source-code-checksums.json');
  const list = Array.isArray(sums) ? sums : sums.files ?? Object.entries(sums).map(([path, v]) => ({ path, sha256: typeof v === 'string' ? v : v.sha256 }));
  const byName = new Map(list.map((e) => [String(e.path ?? e.file).split('/').pop(), e.sha256]));
  for (const f of readdirSync(dir + 'code')) {
    const h = createHash('sha256').update(readFileSync(dir + 'code/' + f)).digest('hex');
    assert.equal(h, byName.get(f), `${f} differs from the package`);
  }
  for (const stage of STAGES) {
    for (const cell of stage.cells) {
      const e = excerpt(read('code/' + cell.file), cell);
      assert.ok(e.code.includes(cell.anchor));
    }
  }
  assert.throws(() => excerpt('a\nb', { file: 'x', from: 1, to: 2, anchor: 'zzz' }), /no longer contain/);
});

test('the download record lists 20 verified archives', () => {
  const s = sourceSummary(json('source-manifest.json'));
  assert.equal(s.archives, 20);
  assert.equal(s.first, '2025-01');
  assert.equal(s.last, '2026-08');
});

test('the saved validation summary reports the passing build', () => {
  const v = json('validation-summary.json');
  assert.equal(v.passed, true);
  assert.equal(v.dbt_data_tests, 92);
  assert.equal(v.dbt_models, 9);
  assert.equal(v.python_tests, 8);
  assert.equal(v.independent_monthly_kpi_checks, 180);
});

// The page text (src/content/lab/aviation-reliability.md) repeats figures by hand. Pin each one to the
// saved files, so a change in the data or a typo fails the build instead of reaching the page.
const md = readFileSync(fileURLToPath(new URL('../src/content/lab/aviation-reliability.md', import.meta.url)), 'utf8');
const pts = (pp) => `${Math.abs(pp).toFixed(2)} points`;
const pctWhole = (r) => `${Math.floor(r * 100)}%`;

test('the results table on the page matches the recomputed figures', () => {
  const m = matched(rows);
  assert.ok(md.includes(`| Scheduled flights | ${m.before.scheduled.toLocaleString('en-GB')} | ${m.after.scheduled.toLocaleString('en-GB')} |`));
  for (const x of m.metrics) {
    const line = `| ${x.label} | ${fmtValue(x.key, x.before)} | ${fmtValue(x.key, x.after)} |`;
    assert.ok(md.includes(line), `missing or wrong row: ${line}`);
  }
});

test('the mix, uncertainty and pipeline sentences match the saved analysis', () => {
  const a = json('analysis-results.json');
  const v = json('validation-summary.json');
  const fm = a.fixed_mix;
  assert.ok(md.includes(`The network-wide fall is ${pts(a.raw_otp_change_pp)}`));
  assert.ok(md.includes(`${fm.strata.toLocaleString('en-GB')} groups`));
  assert.ok(md.includes(`with at least ${fm.minimum_observed_each_year} arrivals each`));
  assert.ok(md.includes(`it is ${pts(fm.common_unadjusted_difference_pp)} as measured and ${pts(fm.difference_pp)} with the mix held fixed`));
  assert.ok(md.includes(`cover ${pctWhole(Math.min(fm.coverage_2025, fm.coverage_2026))} of each year's arrivals`));
  const s5 = a.fixed_mix_sensitivity['5'];
  const s50 = a.fixed_mix_sensitivity['50'];
  assert.ok(md.includes(`fixed-mix fall is ${pts(s5.difference_pp)}, on ${pctWhole(Math.min(s5.coverage_2025, s5.coverage_2026))} of arrivals`));
  assert.ok(md.includes(`with 50 it is ${pts(s50.difference_pp)}, on ${pctWhole(Math.min(s50.coverage_2025, s50.coverage_2026))}`));
  const b = a.block_bootstrap;
  assert.ok(md.includes(`${b.repetitions.toLocaleString('en-GB')} repetitions`));
  assert.ok(md.includes(`at −${Math.abs(b.low_pp).toFixed(2)} to +${b.high_pp.toFixed(2)} points`));
  assert.ok(b.low_pp < 0 && b.high_pp > 0, 'the page says the range includes zero');
  assert.ok(md.includes(`${v.dbt_models} models, ${v.dbt_data_tests} data tests passed, and ${v.python_tests} Python tests passed`));
  const r = reconcile(rows, json('independent-raw-totals.json'));
  assert.ok(md.includes(`in all ${r.comparisons} comparisons, 9 measures for each of ${rows.length} months`));
  assert.ok(md.includes(`In total ${overview(rows).flights.toLocaleString('en-GB')} scheduled flights`));
});

test('the page keeps My take empty and its claims about the average', () => {
  assert.match(md, /## My take\s*$/);
  const m = matched(rows);
  const get = (k) => m.metrics.find((x) => x.key === k);
  assert.equal(fmtValue('mean_signed_delay', get('mean_signed_delay').before), fmtValue('mean_signed_delay', get('mean_signed_delay').after));
  assert.ok(get('mean_positive_delay').after > get('mean_positive_delay').before, 'the page says minutes late went up');
  const rise = get('cancellation_rate').after / get('cancellation_rate').before - 1;
  assert.ok(Math.abs(rise - 0.4) < 0.01, 'the page says cancellations rose by two fifths');
});
