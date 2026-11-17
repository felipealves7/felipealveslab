// Tests for the spring clock change pipeline: clock rules, sun position, the FARS loader and its
// joins, the estimators, and the saved outputs in data/dst-crashes/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTzdata, parseTzdata, dstStart, dstEnd, observesDst, utcOffsetMinutes, resolveOn, weekday } from './clock.mjs';
import { solarElevation, sunClass } from './sun.mjs';
import { normalise, farsLight, validCoords, anchorsFor, aggregateYear, decodeAccident, sunAtCrash, toCsv, COLUMNS } from './extract.mjs';
import { parseWindow, rateRatio, excessPerYear, bootstrap, rng, yearSums, dailyIndex, analyse, estimate, CONTROL, TREAT } from './analyse.mjs';
import { STATES, EXCLUDED } from './states.mjs';

const tz = loadTzdata();
const read = (p) => readFileSync(new URL(`../../data/dst-crashes/${p}`, import.meta.url), 'utf8');

test('clock: spring change dates follow the US rule, including the 2007 move', () => {
  const s = (y) => { const d = dstStart(tz, y); return `${d.m}-${d.d}`; };
  assert.equal(s(1996), '4-7');
  assert.equal(s(2006), '4-2');
  assert.equal(s(2007), '3-11');
  assert.equal(s(2024), '3-10');
  assert.equal(s(2026), '3-8');
  const e = dstEnd(tz, 2007);
  assert.deepEqual([e.m, e.d], [11, 4]);
  assert.deepEqual([dstEnd(tz, 2006).m, dstEnd(tz, 2006).d], [10, 29]);
  for (let y = 1996; y <= 2024; y++) assert.equal(weekday(y, dstStart(tz, y).m, dstStart(tz, y).d), 0, `${y} is a Sunday`);
});

test('clock: tz ON fields resolve', () => {
  assert.equal(resolveOn('lastSun', 2024, 3), 31);
  assert.equal(resolveOn('Sun>=8', 2024, 3), 10);
  assert.equal(resolveOn('Sun>=1', 2001, 4), 1);
  assert.equal(resolveOn('14', 2024, 8), 14);
  assert.throws(() => resolveOn('firstSun', 2024, 3), /Unsupported/);
});

test('clock: Arizona and Hawaii keep standard time; Indiana starts in 2006; other zones observe', () => {
  for (let y = 1996; y <= 2024; y++) {
    assert.equal(observesDst(tz, 'America/Phoenix', y, 4, 1), false);
    assert.equal(observesDst(tz, 'Pacific/Honolulu', y, 4, 1), false);
    assert.equal(observesDst(tz, 'America/Chicago', y, 4, 1), true);
  }
  assert.equal(observesDst(tz, 'America/Indiana/Indianapolis', 2005, 4, 10), false);
  assert.equal(observesDst(tz, 'America/Indiana/Indianapolis', 2006, 4, 10), true);
  assert.throws(() => observesDst(tz, 'America/Nowhere', 2000, 1, 1), /not in the extract/);
  // Every state's zone is in the extract.
  for (const [, , zone] of Object.values(STATES)) assert.ok(tz.zones[zone], zone);
});

test('clock: UTC offsets either side of the skipped hour', () => {
  assert.equal(utcOffsetMinutes(tz, 'America/New_York', 2024, 3, 10, 1 * 60 + 59), -300);
  assert.equal(utcOffsetMinutes(tz, 'America/New_York', 2024, 3, 10, 3 * 60), -240);
  assert.equal(utcOffsetMinutes(tz, 'America/New_York', 2024, 3, 9, 23 * 60), -300);
  assert.equal(utcOffsetMinutes(tz, 'America/New_York', 2024, 11, 3, 2 * 60), -300);
  assert.equal(utcOffsetMinutes(tz, 'America/Phoenix', 2024, 7, 1, 12 * 60), -420);
  assert.equal(utcOffsetMinutes(tz, 'America/Los_Angeles', 2006, 4, 3, 8 * 60), -420);
  assert.equal(utcOffsetMinutes(tz, 'America/Los_Angeles', 2006, 3, 20, 8 * 60), -480);
});

test('clock: a zone on an unsupported named rule is refused', () => {
  const t = parseTzdata('Rule\tUS\t2007\tmax\t-\tMar\tSun>=8\t2:00\t1:00\tD\nZone X/Y\t-5:00\tNYC\tE%sT\n');
  assert.throws(() => observesDst(t, 'X/Y', 2000, 1, 1), /only US/);
});

test('sun: noon on the March equinox at 40°N is about 50° up; midnight is dark', () => {
  // Solar noon at 105°W is about 19:07 UTC on 20 March.
  const noon = solarElevation(40, -105, Date.UTC(2024, 2, 20, 19, 7));
  assert.ok(Math.abs(noon - 50) < 1, `noon elevation ${noon}`);
  assert.equal(sunClass(solarElevation(40, -105, Date.UTC(2024, 2, 21, 7, 0))), 'dark');
  assert.equal(sunClass(-3), 'twilight');
  assert.equal(sunClass(-0.5), 'day');
});

test('sun: the clock change moves sunrise an hour later on the clock', () => {
  // New York, 7:00 clock time: in daylight on the Friday before the 2024 change, in the dark-to-twilight the Monday after.
  const before = sunAtCrash(tz, { year: 2024, m: 3, d: 8, hour: 7, minute: 0, lat: 40.71, lon: -74.0 }, 'America/New_York');
  const after = sunAtCrash(tz, { year: 2024, m: 3, d: 11, hour: 7, minute: 0, lat: 40.71, lon: -74.0 }, 'America/New_York');
  assert.equal(before, 'day');
  assert.notEqual(after, 'day');
  assert.equal(sunAtCrash(tz, { year: 2024, m: 3, d: 11, hour: null, minute: null, lat: 40, lon: -74 }, 'America/New_York'), null);
});

test('loader: normalises rows from old and new layouts, and drops unknown dates', () => {
  const old = normalise({ STATE: '4', MONTH: '4', DAY: '8', YEAR: '96', HOUR: '7', MINUTE: '30', FATALS: '2', LGT_COND: '1', DAY_WEEK: '2' }, 1996);
  assert.equal(old.year, 1996);
  assert.equal(old.dayWeekOk, true);
  assert.equal(old.lat, null);
  const fresh = normalise({ STATE: '6', MONTH: '3', DAY: '11', HOUR: '99', MINUTE: '99', FATALS: '1', LGT_COND: '2', DAY_WEEK: '2', LATITUDE: '34.05', LONGITUD: '-118.25' }, 2024);
  assert.equal(fresh.hour, null);
  assert.equal(fresh.lat, 34.05);
  assert.deepEqual(normalise({ STATE: '6', MONTH: '99', DAY: '99', HOUR: '1', MINUTE: '1', FATALS: '1', LGT_COND: '1', DAY_WEEK: '1' }, 2024), { drop: 'unknown date' });
  assert.deepEqual(normalise({ STATE: '6', MONTH: '2', DAY: '30', HOUR: '1', MINUTE: '1', FATALS: '1', LGT_COND: '1', DAY_WEEK: '1' }, 2024), { drop: 'unknown date' });
  assert.deepEqual(normalise({ STATE: '6', MONTH: '2' }, 2024), { drop: 'missing column DAY' });
  // Lower-case headers (some years) are read too.
  assert.equal(normalise({ state: '6', month: '3', day: '1', hour: '1', minute: '1', fatals: '1', lgt_cond: '1', day_week: '6' }, 2024).state, 6);
});

test('loader: light codes, coordinates and the byte-order mark', () => {
  assert.equal(farsLight(1), 'day');
  assert.equal(farsLight(5), 'twilight');
  assert.equal(farsLight(6), 'dark');
  assert.equal(farsLight(9), 'unknown');
  assert.equal(validCoords(88.8888, 888.8888), false);
  assert.equal(validCoords(77.7777, -77.7777), false);
  assert.equal(validCoords(21.3, -157.8), true);
  const withBom = decodeAccident(Buffer.from('﻿STATE,DAY\n1,2\n', 'utf8'));
  assert.equal(withBom.bom, true);
  assert.ok(withBom.text.startsWith('STATE,'));
  assert.equal(decodeAccident(Buffer.from('STATE\n', 'latin1')).bom, false);
});

test('joins: anchors, groups, exclusions and window offsets', () => {
  const a2006 = anchorsFor(tz, 2006);
  assert.deepEqual(a2006.map((a) => [a.name, a.m, a.d, a.isChange]), [['april1', 4, 2, true], ['march2', 3, 12, false]]);
  const a2007 = anchorsFor(tz, 2007);
  assert.deepEqual(a2007.map((a) => [a.name, a.m, a.d, a.isChange]), [['april1', 4, 1, false], ['march2', 3, 11, true]]);
  const crash = (state, m, d, extra = {}) => ({ ...normalise({ STATE: String(state), MONTH: String(m), DAY: String(d), HOUR: '8', MINUTE: '0', FATALS: '1', LGT_COND: '1', DAY_WEEK: String(weekday(2024, m, d) + 1), ...extra }, 2024) });
  const { cells, tally } = aggregateYear(tz, 2024, [
    crash(4, 3, 11), crash(36, 3, 11), crash(36, 3, 11, { FATALS: '3' }), crash(18, 3, 11), crash(43, 3, 11), crash(36, 1, 15),
  ]);
  const az = cells.get('march2|4|1');
  const ny = cells.get('march2|36|1');
  assert.equal(az.group, 'standard');
  assert.equal(ny.group, 'observing');
  assert.equal(ny.crashes, 2);
  assert.equal(ny.deaths, 4);
  assert.equal(ny.crashes_am, 2);
  assert.equal(ny.weekday, 1);
  assert.equal(ny.date, '2024-03-11');
  assert.equal(ny.is_change, 1);
  // 11 March 2024 is also 21 days before the first Sunday of April (7 April), outside its window.
  assert.equal(cells.get('april1|36|-27'), undefined);
  assert.equal(tally.excluded, 2, 'Indiana and Puerto Rico are left out');
  assert.equal(tally.inWindow, 3);
  assert.ok(EXCLUDED[18]);
  assert.equal(toCsv([...cells.values()]).split('\n')[0], COLUMNS.join(','));
});

test('estimators: rate ratio, excess, bootstrap and the daily index on made-up numbers', () => {
  const sums = [{ t: 110, c: 300 }, { t: 100, c: 300 }];
  assert.equal(rateRatio(sums), (210 / 5) / (600 / 15));
  assert.equal(excessPerYear(sums), (210 - 200) / 2);
  const r1 = rng(1);
  const r2 = rng(1);
  assert.equal(r1(), r2());
  const ci = bootstrap([sums], rateRatio, { b: 200 });
  assert.ok(ci[0] <= rateRatio(sums) && rateRatio(sums) <= ci[1]);
  // A flat series: every day has 10 crashes, so every index is 1.
  const rows = [];
  for (let o = -14; o <= 14; o++) rows.push({ year: 2000, offset: o, crashes: 10, group: 'observing', is_change: 1 });
  assert.ok(dailyIndex(rows, () => true, [2000]).every((d) => d.index === 1));
  assert.deepEqual(yearSums(rows, () => true, 'crashes', [2000, 2001]), [{ year: 2000, t: 50, c: 150 }, { year: 2001, t: 0, c: 0 }]);
  assert.equal(TREAT.length, 5);
  assert.equal(CONTROL.length, 15);
  assert.ok(TREAT.every((o) => !CONTROL.includes(o)));
});

test('saved data: every year has both windows, groups come from the clock rules', () => {
  const rows = parseWindow(read('window.csv'));
  const extract = JSON.parse(read('extract.json'));
  assert.equal(extract.years.length, 29);
  for (let y = 1996; y <= 2024; y++) {
    const yr = rows.filter((r) => r.year === y);
    assert.ok(yr.some((r) => r.anchor === 'april1') && yr.some((r) => r.anchor === 'march2'), `${y}`);
    assert.equal(new Set(yr.filter((r) => r.is_change).map((r) => r.anchor)).size, 1);
    assert.equal(yr.find((r) => r.is_change).anchor, y < 2007 ? 'april1' : 'march2');
  }
  assert.deepEqual([...new Set(rows.filter((r) => r.group === 'standard').map((r) => r.state))].sort(), ['AZ', 'HI']);
  assert.ok(!rows.some((r) => r.state === 'IN'));
  assert.ok(rows.every((r) => r.offset >= -14 && r.offset <= 14 && r.crashes > 0 && r.deaths >= r.crashes));
  assert.ok(rows.every((r) => r.crashes_sun_day + r.crashes_sun_twilight + r.crashes_sun_dark <= r.crashes));
  assert.ok(rows.every((r) => r.crashes_am + r.crashes_pm + r.crashes_time_unknown <= r.crashes));
  // Each year's layout loaded: no row lost to a missing column, no weekday disagreement.
  for (const y of extract.years) {
    assert.deepEqual(Object.keys(y.dropped).filter((k) => k !== 'unknown date'), [], `${y.year}`);
    assert.equal(y.dayWeekMismatch, 0, `${y.year}`);
    assert.ok(y.crashes > 25000, `${y.year}`);
  }
  assert.deepEqual(extract.years.filter((y) => y.byteOrderMark).map((y) => y.year), [2021, 2022]);
});

test('saved results: rerunning the analysis on the saved window reproduces results.json', () => {
  const rows = parseWindow(read('window.csv'));
  const extract = JSON.parse(read('extract.json'));
  const saved = JSON.parse(read('results.json'));
  assert.deepEqual(analyse(rows, extract), saved);
  // The window sums match an independent recount.
  const e = estimate(rows, { label: 'x', filter: (r) => r.group === 'observing' && r.is_change === 1, years: [2024] });
  const t = rows.filter((r) => r.year === 2024 && r.group === 'observing' && r.is_change === 1 && r.offset >= 1 && r.offset <= 5).reduce((n, r) => n + r.crashes, 0);
  assert.equal(e.treat, t);
});
