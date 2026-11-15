// Pins the figures and sentences on /lab/brazil-power-price-contract to the saved results in
// data/ccee-pld/results.json, so a rerun that changes a number fails here until the page is updated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const saved = JSON.parse(read('data/ccee-pld/results.json'));
const page = read('src/content/lab/brazil-power-price-contract.md');
const int = (n) => n.toLocaleString('en-GB');
const real = saved.runs.filter((r) => r.kind === 'real').at(-1);
const rehearsal = saved.runs.filter((r) => r.kind === 'rehearsal').at(-1);
const rows = (run) => run.files.reduce((n, f) => n + f.rows, 0);

test('the page reads the same file the site serves', () => {
  assert.equal(read('public/data/ccee-pld/results.json'), read('data/ccee-pld/results.json'));
  assert.match(page, /data-src="\/data\/ccee-pld\/results\.json"/);
});

test('the real run: passed, 13 of 13, rows and days as printed', () => {
  assert.equal(real.status, 'passed');
  assert.equal(real.checks.length, 13);
  assert.ok(real.checks.every((k) => k.status === 'pass'));
  assert.equal(real.runDate, '2026-11-15');
  assert.equal(real.retrieved, '2026-11-14');
  assert.ok(page.includes('First real run, 15 Nov 2026, on the files downloaded 14 Nov 2026: passed 13 of 13 checks.'));
  assert.ok(page.includes(`${int(rows(real))} hourly prices in six yearly files`));
  assert.equal(real.files.length, 6);
  assert.equal(saved.summary.first, '2021-01-01');
  assert.equal(saved.summary.last, '2026-11-14');
  assert.ok(page.includes(`${int(saved.summary.days)} days`));
});

test('the rehearsal: failed with one cause, two checks not run, ten passed', () => {
  assert.equal(rehearsal.status, 'failed');
  assert.equal(rehearsal.causes.length, 1);
  assert.equal(rehearsal.causes[0].cause, 'Column PLD_HORA is missing from pld_horario_2026.csv');
  assert.ok(page.includes(`"${rehearsal.causes[0].cause}"`));
  assert.equal(rehearsal.checks.filter((k) => k.status === 'not run').length, 2);
  assert.equal(rehearsal.checks.filter((k) => k.status === 'pass').length, 10);
  assert.ok(page.includes('The other 10 checks passed.'));
});

test('the contract table on the page lists exactly the checks the code runs', () => {
  const listed = [...page.matchAll(/^\| (?:File|Row|Set) \| `([a-z_.0-9]+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual(listed, saved.contract.map((c) => c.id));
});

test('snapshots and restatements as printed', () => {
  assert.equal(saved.snapshots.length, 1);
  assert.equal(saved.comparisons.length, 0);
  assert.ok(page.includes('Restatements: none looked for yet.'));
  assert.equal(Object.keys(saved.snapshots[0].months).length, 71);
  assert.ok(page.includes('71 months are fingerprinted.'));
});

test('format drift in the 2025 file as printed', () => {
  const f2025 = real.files.find((f) => f.name === 'pld_horario_2025.csv');
  assert.equal(f2025.shape.zeroPaddedDays, 2592);
  assert.ok(page.includes('2,592 rows'));
  assert.equal(real.files.find((f) => f.name === 'pld_horario_2026.csv').shape.order, 'newest first');
});

test('price figures as printed', () => {
  const max = saved.summary.yearly.reduce((a, y) => (y.max > a.max ? y : a));
  assert.equal(max.max, 1611.04);
  assert.equal(max.maxAt, '2026-09-01 18:00');
  assert.ok(saved.summary.yearly.filter((y) => y.year === 2026).every((y) => y.max === 1611.04 && y.maxAt === '2026-09-01 18:00'));
  assert.ok(page.includes('1,611.04, in all four submarkets, on 1 Sep 2026 at 18:00'));
  const se = saved.summary.yearly.filter((y) => y.submarket === 'SUDESTE').map((y) => y.mean.toFixed(2));
  assert.deepEqual(se, ['280.50', '59.05', '72.16', '128.16', '224.31', '194.92']);
  assert.ok(page.includes('280.50 (2021), 59.05 (2022), 72.16 (2023), 128.16 (2024), 224.31 (2025) and 194.92 (2026 to 14 Nov)'));
});
