// Tests for the lockdown and power-load lab. Small made-up inputs for each rule, then the real
// saved files: every check passes and the saved results are exactly what the code makes.
// Run: node --test pipelines/power-lockdown/power.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { easter, holidayOf, referenceDays, comparable, isoWeek, weekday } from './calendar.mjs';
import { readHourly, readStringency, readSgs } from './load.mjs';
import { buildBridge, bridgeChecks, subsystemStringency } from './bridge.mjs';
import { slope, bootstrap, dailyLoad, indexLoad, dayRatio, compute } from './analyse.mjs';
import { oxcgrtExtract, sha256 } from './fetch.mjs';

const failed = (checks, id) => checks.find((c) => c.id === id).failed;

test('Easter, Carnival, the Easter weekend, Corpus Christi and bridge days', () => {
  assert.deepEqual([2018, 2019, 2020, 2021].map(easter), ['2018-04-01', '2019-04-21', '2020-04-12', '2021-04-04']);
  assert.equal(holidayOf('2020-02-24'), 'Carnival Monday');
  assert.equal(holidayOf('2020-02-25'), 'Carnival Tuesday');
  assert.equal(holidayOf('2020-04-10'), 'Good Friday');
  assert.equal(holidayOf('2020-04-11'), 'Holy Saturday');
  assert.equal(holidayOf('2020-06-11'), 'Corpus Christi');
  assert.equal(holidayOf('2020-06-12'), 'Bridge day (Corpus Christi)'); // Friday after a Thursday holiday
  assert.equal(holidayOf('2020-04-20'), 'Bridge day (Tiradentes)'); // Monday before a Tuesday holiday
  assert.equal(holidayOf('2020-04-22'), null);
});

test('reference days fall on the same weekday, and a holiday in any of the three drops the day', () => {
  for (const d of ['2020-03-01', '2020-04-15', '2021-07-07']) {
    for (const r of referenceDays(d)) assert.equal(weekday(r), weekday(d));
  }
  assert.deepEqual(referenceDays('2020-04-15'), ['2019-04-17', '2018-04-18']);
  assert.equal(comparable('2020-04-15'), true);
  assert.equal(comparable('2020-04-17'), false); // 2019-04-19 was Good Friday
  assert.equal(comparable('2020-02-25'), false); // Carnival Tuesday itself
});

test('ISO weeks', () => {
  assert.equal(isoWeek('2020-04-20'), '2020-W17');
  assert.equal(isoWeek('2021-01-01'), '2020-W53');
  assert.equal(isoWeek('2018-12-31'), '2019-W01');
});

// A made-up ONS file for the first two days of 2019, with every hour of all four subsystems.
function onsFile(edit = (rows) => rows) {
  const rows = [];
  for (const d of ['2019-01-01']) for (let h = 0; h < 24; h += 1) for (const s of ['N', 'NE', 'S', 'SE']) rows.push([s, 'X', `${d} ${String(h).padStart(2, '0')}:00:00`, '100.5']);
  return ['id_subsistema;nom_subsistema;din_instante;val_cargaenergiahomwmed', ...edit(rows).map((r) => r.join(';'))].join('\n');
}
// readHourly checks a whole year; this file holds one day, so only load.complete counts the rest.
const oneDay = (text) => readHourly(text, 2019);

test('ONS load: a clean day passes every row check', () => {
  const { rows, checks } = oneDay(onsFile());
  assert.equal(rows.length, 96);
  for (const id of ['load.columns', 'load.subsystem', 'load.instant', 'load.value', 'load.unique']) assert.equal(failed(checks, id), 0, id);
  assert.equal(failed(checks, 'load.complete'), 364 * 96); // the other 364 days of 2019 are missing
});

test('ONS load: a renamed column, an unknown subsystem, a negative value and a duplicate each fail their check', () => {
  assert.equal(failed(oneDay(onsFile().replace('val_cargaenergiahomwmed', 'val_carga')).checks, 'load.columns'), 1);
  assert.equal(failed(oneDay(onsFile((r) => { r[0][0] = 'SECO'; return r; })).checks, 'load.subsystem'), 1);
  assert.equal(failed(oneDay(onsFile((r) => { r[0][3] = '-1'; return r; })).checks, 'load.value'), 1);
  assert.equal(failed(oneDay(onsFile((r) => { r[0][3] = ''; return r; })).checks, 'load.value'), 1);
  assert.equal(failed(oneDay(onsFile((r) => [...r, r[5]])).checks, 'load.unique'), 1);
  assert.equal(failed(oneDay(onsFile((r) => { r[0][2] = '2018-12-31 00:00:00'; return r; })).checks, 'load.instant'), 1);
});

test('ONS load: the hour skipped when clocks went forward is not a fault, and its day is left out', () => {
  const text = ['id_subsistema;nom_subsistema;din_instante;val_cargaenergiahomwmed', 'S;SUL;2018-11-04 00:00:00;0', 'N;NORTE;2018-11-04 00:00:00;', 'N;NORTE;2018-11-04 01:00:00;5'].join('\n');
  const { rows, checks } = readHourly(text, 2018);
  assert.equal(failed(checks, 'load.value'), 0);
  assert.equal(checks.find((c) => c.id === 'load.value').clock_forward_hours, 2);
  // The same empty value on an ordinary night fails.
  assert.equal(failed(readHourly(text.replaceAll('2018-11-04', '2018-11-05'), 2018).checks, 'load.value'), 1);
  // A day with the empty hour has fewer than 24 real hours and is dropped.
  assert.equal(dailyLoad(rows).length, 0);
});

test('OxCGRT: values outside 0 to 100, a wrong jurisdiction and missing days fail', () => {
  const head = 'RegionName,RegionCode,Jurisdiction,Date,StringencyIndex_Average';
  const { checks } = readStringency([head, 'Acre,BR_AC,STATE_TOTAL,20200101,0', 'Acre,BR_AC,STATE_WIDE,20200102,101'].join('\n'));
  assert.equal(failed(checks, 'policy.value'), 1);
  assert.equal(failed(checks, 'policy.states'), 26);
  assert.equal(failed(checks, 'policy.complete'), 729);
});

test('OxCGRT extract keeps Brazil state rows for 2020 and 2021 only', () => {
  const cols = ['CountryName', 'CountryCode', 'RegionName', 'RegionCode', 'CityName', 'CityCode', 'Jurisdiction', 'Date', 'StringencyIndex_Average'];
  const text = [cols.join(','),
    'Brazil,BRA,Acre,BR_AC,,,STATE_TOTAL,20200301,11.1',
    'Brazil,BRA,Acre,BR_AC,Rio Branco,X,CITY_TOTAL,20200301,22.2',
    'Brazil,BRA,,,,,NAT_TOTAL,20200301,33.3',
    'Brazil,BRA,Acre,BR_AC,,,STATE_TOTAL,20220101,44.4',
    'Chile,CHL,X,CL_X,,,STATE_TOTAL,20200301,55.5'].join('\n');
  assert.equal(oxcgrtExtract(text), 'RegionName,RegionCode,Jurisdiction,Date,StringencyIndex_Average\nAcre,BR_AC,STATE_TOTAL,20200301,11.1\n');
});

test('IBC-Br: months read as YYYY-MM, a missing month fails', () => {
  const { rows, checks } = readSgs(JSON.stringify([{ data: '01/04/2020', valor: '120.5' }]), 24363);
  assert.deepEqual(rows, [{ month: '2020-04', value: 120.5 }]);
  assert.equal(failed(checks, 'activity.24363.complete'), 59);
});

// Made-up ONS substation and transformer tables for three states.
const SUBS = ['id_subsistema;id_estado', 'S;PR', 'S;PR', 'SE;PR', 'S;SC', 'SE;SP', 'SE;SP', 'N;SP'].join('\n');
const MVA = ['id_subsistema;id_estado;dat_entradaoperacao;dat_desativacao;val_potencianominal_mva',
  'S;PR;2010-01-01;;300', 'SE;PR;2010-01-01;;9000', 'S;SC;2010-01-01;;100', 'S;SC;2021-01-01;;5000', 'S;SC;2010-01-01;2019-01-01;5000',
  'SE;SP;2000-01-01;;1000', 'N;MA;2000-01-01;;10', 'NE;BA;2000-01-01;;10', 'N;SP;2000-01-01;;7'].join('\n');

test('bridge: each state joins the subsystem with most of its substations, weighted by capacity in service', () => {
  const states = ['PR', 'SC', 'SP'];
  const bridge = buildBridge(SUBS, MVA, states);
  const pr = bridge.find((r) => r.state === 'PR');
  assert.deepEqual([pr.subsystem, pr.substations, pr.substations_elsewhere, pr.mva], ['S', 2, 1, 300]);
  // SC: the transformer commissioned in 2021 and the one retired in 2019 are not counted.
  assert.equal(bridge.find((r) => r.state === 'SC').mva, 100);
  assert.equal(pr.w_capacity, 0.75);
  assert.equal(pr.w_equal, 0.5);
  assert.equal(bridge.find((r) => r.state === 'SP').w_capacity, 1);
  const checks = bridgeChecks(bridge, states);
  assert.equal(failed(checks, 'bridge.covers'), 2); // no state in N or NE here
  assert.equal(failed(checks, 'bridge.one_subsystem'), 0);
  // The two empty subsystems also fail the sums, which hold in S and SE.
  assert.equal(failed(checks, 'bridge.sum_capacity'), 2);
  assert.equal(failed(checks, 'bridge.sum_equal'), 2);
  assert.throws(() => buildBridge('id_subsistema;id_estado\nS;PR\nSE;PR', MVA, ['PR']), /split evenly/);
  assert.throws(() => buildBridge(SUBS, MVA, ['RJ']), /no substation/);
});

test('weighted stringency: a state with no value that day is left out and the rest still sum to one', () => {
  const bridge = buildBridge(SUBS, MVA, ['PR', 'SC', 'SP']);
  const policy = [
    { state: 'PR', date: '2020-04-01', stringency: 80 },
    { state: 'SC', date: '2020-04-01', stringency: 40 },
    { state: 'PR', date: '2020-04-02', stringency: 60 },
    { state: 'SC', date: '2020-04-02', stringency: NaN },
  ];
  const out = subsystemStringency(bridge, policy, 'capacity').filter((r) => r.subsystem === 'S');
  assert.equal(out[0].stringency, 0.75 * 80 + 0.25 * 40);
  assert.equal(out[1].stringency, 60);
  assert.equal(out[1].weight_used, 0.75);
  assert.equal(out[1].states_used, 1);
});

test('slope recovers a known dose, with and without day effects', () => {
  const panel = [];
  const units = { a: 0.3, b: -0.1, c: 0.05, d: 0 };
  for (let day = 0; day < 30; day += 1) {
    for (const [u, fe] of Object.entries(units)) {
      const x = ((day * 7 + u.charCodeAt(0) * 3) % 11) / 2;
      panel.push({ unit: u, day: `d${day}`, week: `w${Math.floor(day / 7)}`, x, y: -0.02 * x + fe + 0.01 * Math.sin(day) });
    }
  }
  assert.ok(Math.abs(slope(panel, { dayEffects: true }) + 0.02) < 1e-12);
  const [lo, hi] = bootstrap(panel, { dayEffects: true }, { reps: 200, seed: 1 });
  assert.ok(lo <= -0.02 + 1e-9 && hi >= -0.02 - 1e-9);
  assert.deepEqual(bootstrap(panel, { dayEffects: false }, { reps: 50, seed: 7 }), bootstrap(panel, { dayEffects: false }, { reps: 50, seed: 7 }));
});

test("a day's ratio uses both reference days, and Brazil is the sum of the four subsystems", () => {
  const daily = [];
  for (const [date, v] of [['2020-04-15', 90], ['2019-04-17', 100], ['2018-04-18', 80]]) {
    for (const s of ['N', 'NE', 'S', 'SE']) daily.push({ subsystem: s, date, mwh: v });
  }
  const idx = indexLoad(daily);
  assert.equal(idx.get('BR|2020-04-15'), 360);
  assert.equal(dayRatio(idx, 'N', '2020-04-15'), 1);
  assert.equal(dayRatio(idx, 'BR', '2020-04-15'), 1);
  assert.equal(dayRatio(idx, 'N', '2020-04-17'), null);
});

test('real files: every check passes and the saved results and tables are what the code makes', () => {
  const { results, tables } = compute();
  assert.equal(results.checks.passed, results.checks.total);
  assert.equal(results.checks.total, 41);
  const saved = JSON.parse(readFileSync(new URL('../../data/power-lockdown/results.json', import.meta.url), 'utf8'));
  assert.deepEqual(results, saved);
  for (const [name, text] of Object.entries(tables)) {
    assert.equal(text, readFileSync(new URL(`../../data/power-lockdown/${name}`, import.meta.url), 'utf8'), name);
  }
  // The raw files are the ones whose checksums sources.json records.
  const sources = JSON.parse(readFileSync(new URL('../../data/power-lockdown/sources.json', import.meta.url), 'utf8'));
  assert.equal(sources.files.length, 9);
  for (const f of sources.files) {
    const buf = readFileSync(new URL(`../../data/power-lockdown/raw/${f.file}`, import.meta.url));
    assert.equal(sha256(buf), f.sha256, f.file);
    assert.equal(buf.length, f.bytes, f.file);
  }
});
