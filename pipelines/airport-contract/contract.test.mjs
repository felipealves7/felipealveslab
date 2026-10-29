import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseCsv } from './csv.mjs';
import { runContract, freshness, REQUIRED_COLUMNS, ROW_BOUNDS } from './contract.mjs';
import { applyRename, makeRun, OUTPUTS } from './run.mjs';

test('csv reader handles quotes, doubled quotes, commas and newlines inside fields', () => {
  const { columns, rows } = parseCsv('a,b\r\n"x, y","say ""hi"""\n"two\nlines",\n');
  assert.deepEqual(columns, ['a', 'b']);
  assert.deepEqual(rows, [{ a: 'x, y', b: 'say "hi"' }, { a: 'two\nlines', b: '' }]);
});

// A tiny table that satisfies every row check; row-count bounds are set aside by shrinking them.
function good() {
  const mk = (t, rows) => ({ columns: REQUIRED_COLUMNS[t], rows });
  return {
    airports: mk('airports', [
      { id: '1', ident: 'AAA', type: 'large_airport', name: 'A', latitude_deg: '10', longitude_deg: '20', elevation_ft: '5', continent: 'EU', iso_country: 'GB', iso_region: 'GB-ENG', scheduled_service: 'yes', iata_code: 'AAA' },
      { id: '2', ident: 'BBB', type: 'heliport', name: 'B', latitude_deg: '-10', longitude_deg: '-20', elevation_ft: '', continent: 'EU', iso_country: 'GB', iso_region: 'GB-SCT', scheduled_service: 'no', iata_code: '' },
    ]),
    runways: mk('runways', [{ id: '9', airport_ref: '1', airport_ident: 'AAA', length_ft: '8000', width_ft: '100', surface: 'ASP', closed: '0' }]),
    countries: mk('countries', [{ id: '5', code: 'GB', name: 'United Kingdom', continent: 'EU' }]),
  };
}
const failedIds = (tables) => runContract(tables).checks.filter((c) => !c.passed).map((c) => c.id);

test('a clean tiny set fails only the row-count bounds, and nothing else', () => {
  assert.deepEqual(failedIds(good()).sort(), ['airports.row_count', 'countries.row_count', 'runways.row_count']);
  assert.ok(ROW_BOUNDS.airports[0] > 2);
});

test('each row check catches the fault it names', () => {
  const cases = [
    ['airports.id_unique_integer', (t) => { t.airports.rows[1].id = '1'; }],
    ['airports.ident_unique', (t) => { t.airports.rows[1].ident = ''; }],
    ['airports.type_allowed', (t) => { t.airports.rows[0].type = 'spaceport'; }],
    ['airports.coordinates', (t) => { t.airports.rows[0].latitude_deg = '91'; }],
    ['airports.country_known', (t) => { t.airports.rows[0].iso_country = 'ZZ'; }],
    ['airports.scheduled_service_yes_no', (t) => { t.airports.rows[0].scheduled_service = 'maybe'; }],
    ['airports.iata_format', (t) => { t.airports.rows[0].iata_code = 'abcd'; }],
    ['airports.elevation_integer', (t) => { t.airports.rows[0].elevation_ft = '12.5'; }],
    ['runways.airport_known', (t) => { t.runways.rows[0].airport_ref = '99'; }],
    ['runways.length_positive', (t) => { t.runways.rows[0].length_ft = '0'; }],
    ['runways.closed_flag', (t) => { t.runways.rows[0].closed = 'yes'; }],
    ['countries.code_unique_two_letters', (t) => { t.countries.rows[0].code = 'gb'; }],
  ];
  for (const [id, break_] of cases) {
    const t = good();
    break_(t);
    assert.ok(failedIds(t).includes(id), `${id} should fail`);
  }
});

test('a tolerance lets a few bad rows through but still counts them', () => {
  const t = good();
  t.runways.rows = Array.from({ length: 2000 }, (_, i) => ({ ...t.runways.rows[0], id: String(i), length_ft: i === 0 ? '0' : '8000' }));
  const c = runContract(t).checks.find((x) => x.id === 'runways.length_positive');
  assert.equal(c.failed, 1);
  assert.equal(c.passed, true); // 1 of 2,000 is 0.05%, under the 0.1% tolerance
});

test('a renamed column fails the column check and every check that reads it', () => {
  const t = good();
  applyRename(t, 'airports.iso_country=country_code');
  const failed = failedIds(t);
  assert.ok(failed.includes('airports.columns'));
  assert.ok(failed.includes('airports.country_known'));
});

test('freshness is stale after the maximum age and tolerates small clock skew', () => {
  assert.equal(freshness('2026-10-29T02:00:00Z', '2026-10-29T08:00:00Z').ok, true);
  assert.equal(freshness('2026-10-20T08:00:00Z', '2026-10-29T08:00:00Z').ok, false);
  assert.equal(freshness('2026-10-29T08:30:00Z', '2026-10-29T08:00:00Z').ok, true);
});

test('a run fails when the upstream file is stale even if every check passes', () => {
  const run = makeRun({ tables: good(), lastModified: '2026-09-01T00:00:00Z', runDate: '2026-10-29T00:00:00Z' });
  assert.equal(run.freshness.ok, false);
  assert.equal(run.status, 'fail');
});

test('saved output is well formed and both copies match', () => {
  const [a, b] = OUTPUTS.map((f) => readFileSync(f, 'utf8'));
  assert.equal(a, b);
  const data = JSON.parse(a);
  assert.ok(data.runs.length >= 2);
  assert.equal(data.synthetic, false);
  for (const r of data.runs) {
    assert.equal(r.status === 'pass', r.checks.every((c) => c.passed) && r.freshness.ok);
    assert.equal(r.checks.length, 19);
  }
  assert.ok(data.runs.some((r) => r.deliberate && r.status === 'fail'));
  assert.ok(data.runs.some((r) => !r.deliberate && r.status === 'pass'));
});
