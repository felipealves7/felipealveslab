import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runContract, readsById, REQUIRED_COLUMNS, buildChecks } from './contract.mjs';
import { FAULTS, applyFaults, spaced, renameColumn } from './faults.mjs';
import { fetchTables, oldest } from './load.mjs';
import { makeRun } from './record.mjs';

// A clean set that satisfies every row check, large enough for each break to pick rows.
function clean() {
  const countries = [['GB', 'United Kingdom', 'EU'], ['FR', 'France', 'EU'], ['BR', 'Brazil', 'SA']];
  const airports = Array.from({ length: 300 }, (_, i) => {
    const [code] = countries[i % 3];
    return {
      id: String(i + 1), ident: `X${i + 1}`, type: 'small_airport', name: `Field ${i + 1}`,
      latitude_deg: '10.5', longitude_deg: '20.25', elevation_ft: '120', continent: 'EU',
      iso_country: code, iso_region: `${code}-01`, scheduled_service: 'no', iata_code: '',
    };
  });
  const runways = Array.from({ length: 300 }, (_, i) => ({
    id: String(i + 1), airport_ref: String((i % 300) + 1), airport_ident: `X${(i % 300) + 1}`,
    length_ft: '3000', width_ft: '75', surface: 'ASP', closed: '0',
  }));
  return {
    airports: { columns: REQUIRED_COLUMNS.airports, rows: airports },
    runways: { columns: REQUIRED_COLUMNS.runways, rows: runways },
    countries: { columns: REQUIRED_COLUMNS.countries, rows: countries.map(([code, name, continent], i) => ({ id: String(i + 1), code, name, continent })) },
  };
}
const RUN_DATE = '2026-10-29T08:00:00.000Z';
const base = () => ({ tables: clean(), lastModified: '2026-10-29T02:00:00.000Z', runDate: RUN_DATE });
const failing = (s) => runContract(s.tables).checks.filter((c) => !c.passed && c.level === 'row').map((c) => c.id).sort();

test('the clean set passes every row check', () => {
  assert.deepEqual(failing(base()), []);
});

test('spaced positions are spread out, never the first row, and capped by the table size', () => {
  assert.deepEqual(spaced(10, 3), [1, 4, 7]);
  assert.equal(spaced(86301, 50).length, 50);
  assert.ok(spaced(86301, 50).every((i) => i >= 1 && i < 86301));
  assert.deepEqual(spaced(3, 50), [1, 2]);
  assert.deepEqual(spaced(1, 5), []);
});

test('each break fails the rules it should, and only those', () => {
  const expected = {
    'rename-country': ['airports.country_known', 'airports.region_matches_country'],
    // The airport whose id was overwritten disappears, so the runways that pointed to it break too.
    'duplicate-ids': ['airports.id_unique_integer', 'runways.airport_known'],
    'north-pole': ['airports.coordinates'],
    'orphan-runways': ['runways.airport_known'],
    'lose-airports': ['runways.airport_known'],
    'lowercase-countries': ['airports.country_known', 'countries.code_unique_two_letters'],
    'stale-file': [],
  };
  for (const f of FAULTS) assert.deepEqual(failing(applyFaults(base(), [f.id])), [...expected[f.id]].sort(), f.id);
});

test('renaming a column also fails the column check, and a stale file fails the run', () => {
  const renamed = applyFaults(base(), ['rename-country']);
  const cols = runContract(renamed.tables).checks.find((c) => c.id === 'airports.columns');
  assert.equal(cols.passed, false);
  assert.deepEqual(cols.samples, ['missing column iso_country']);
  const stale = applyFaults(base(), ['stale-file']);
  const run = makeRun({ tables: stale.tables, lastModified: stale.lastModified, runDate: RUN_DATE });
  assert.equal(run.freshness.ok, false);
  assert.equal(run.status, 'fail');
});

test('breaks never change the original tables and give the same result every time', () => {
  const s = base();
  const before = JSON.stringify(s);
  const ids = FAULTS.map((f) => f.id);
  const a = applyFaults(s, ids);
  const b = applyFaults(s, ids);
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(a, b);
});

test('renameColumn copies, it does not edit in place', () => {
  const t = clean();
  const out = renameColumn(t, 'airports', 'iso_country', 'country_code');
  assert.ok(t.airports.columns.includes('iso_country'));
  assert.ok(out.airports.columns.includes('country_code'));
  assert.equal(out.airports.rows[0].country_code, t.airports.rows[0].iso_country);
  assert.equal(out.runways, t.runways);
});

test('declared column reads are complete: a missing column fails exactly the row checks that read it', () => {
  const reads = readsById();
  const rowChecks = buildChecks(clean()).filter((c) => c.level === 'row');
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    for (const column of columns) {
      const t = clean();
      t[table] = { columns: t[table].columns.filter((c) => c !== column), rows: t[table].rows.map(({ [column]: _drop, ...rest }) => rest) };
      const failed = runContract(t).checks.filter((c) => c.level === 'row' && c.failed > 0).map((c) => c.id).sort();
      const declared = rowChecks.filter((c) => reads[c.id].includes(`${table}.${column}`)).map((c) => c.id).sort();
      assert.deepEqual(failed, declared, `${table}.${column}`);
    }
  }
});

test('a missing iso_region column is reported as failing rows, not a crash', () => {
  const t = clean();
  t.airports = { columns: t.airports.columns.filter((c) => c !== 'iso_region'), rows: t.airports.rows.map(({ iso_region: _r, ...rest }) => rest) };
  const result = runContract(t);
  const region = result.checks.find((c) => c.id === 'airports.region_matches_country');
  assert.equal(region.failed, 300);
  assert.equal(result.status, 'fail');
});

function fakeFetch(files) {
  return async (url) => {
    const name = url.split('/').pop();
    const f = files[name];
    if (!f) return { ok: false, status: 404, headers: { get: () => null } };
    const bytes = new TextEncoder().encode(f.body);
    return { ok: true, status: 200, headers: { get: (h) => (h.toLowerCase() === 'last-modified' ? f.modified : null) }, arrayBuffer: async () => bytes.buffer };
  };
}

test('fetchTables parses each file, records size and timing, and keeps the oldest Last-Modified', async () => {
  const phases = [];
  const out = await fetchTables({
    baseUrl: 'https://example.test/',
    fetchImpl: fakeFetch({
      'airports.csv': { body: 'id,ident\n1,A\n2,B\n', modified: 'Thu, 29 Oct 2026 02:53:52 GMT' },
      'runways.csv': { body: 'id\n9\n', modified: 'Wed, 28 Oct 2026 01:00:00 GMT' },
      'countries.csv': { body: 'id,code\n1,GB\n', modified: null },
    }),
    onProgress: async (p) => { phases.push(`${p.table}:${p.phase}`); },
  });
  assert.equal(out.tables.airports.rows.length, 2);
  assert.equal(out.lastModified, '2026-10-28T01:00:00.000Z');
  assert.equal(out.files.length, 3);
  assert.equal(out.files[0].bytes, 17);
  assert.equal(out.files[2].lastModified, null);
  assert.deepEqual(phases.slice(0, 3), ['airports:download', 'airports:parse', 'airports:done']);
  assert.equal(phases.length, 9);
});

test('fetchTables stops with a plain message when a file is missing', async () => {
  await assert.rejects(fetchTables({ baseUrl: 'https://example.test/', fetchImpl: fakeFetch({}) }), /airports\.csv returned HTTP 404/);
});

test('oldest ignores missing dates', () => {
  assert.equal(oldest([null, '2026-10-29T00:00:00.000Z', '2026-10-01T00:00:00.000Z']), '2026-10-01T00:00:00.000Z');
  assert.equal(oldest([null]), undefined);
});

test('a run made from downloads keeps the file records and the time the checks took', () => {
  const s = base();
  const run = makeRun({ tables: s.tables, lastModified: s.lastModified, runDate: RUN_DATE, files: [{ table: 'airports', bytes: 1 }] });
  assert.equal(run.files.length, 1);
  assert.equal(typeof run.checkMs, 'number');
  const plain = makeRun({ tables: s.tables, lastModified: s.lastModified, runDate: RUN_DATE });
  assert.equal('files' in plain, false);
});
