// Tests for the PLD pipeline. Small made-up files are built in memory for the fault cases (test
// fixtures only, never published); the last tests run the contract on the real files in data/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePldFile, splitLine } from './load.mjs';
import { runContract, addDays } from './contract.mjs';
import { monthDigests, compareDigests, compareRows } from './snapshot.mjs';
import { summarise } from './summary.mjs';
import { readFolder, recordRun, emptyResults, renameColumn } from './run.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SUBS = ['NORDESTE', 'NORTE', 'SUDESTE', 'SUL'];
const HEADER = ['MES_REFERENCIA', 'SUBMERCADO', 'PERIODO_COMERCIALIZACAO', 'DIA', 'HORA', 'PLD_HORA'];

// Rows for nDays from 2021-01-01, price = 100 + hour.
function fixtureRows(nDays, from = '2021-01-01') {
  const rows = [];
  for (let i = 0; i < nDays; i++) {
    const d = addDays(from, i);
    const day = Number(d.slice(8));
    for (let h = 0; h < 24; h++) for (const s of SUBS) {
      rows.push({ MES_REFERENCIA: d.slice(0, 4) + d.slice(5, 7), SUBMERCADO: s, PERIODO_COMERCIALIZACAO: String((day - 1) * 24 + h + 1), DIA: String(day), HORA: String(h), PLD_HORA: String(100 + h) });
    }
  }
  return rows;
}
const file = (rows, name = 'pld_horario_2021.csv') => ({ name, year: Number(name.match(/\d{4}/)[0]), columns: [...HEADER], rows });
const check = (res, id) => res.checks.find((k) => k.id === id);

function toText(rows, { quoted, crlf, reverse }) {
  const q = (v) => (quoted ? `"${v}"` : v);
  const lines = [HEADER.map(q).join(';')];
  for (const r of reverse ? [...rows].reverse() : rows) {
    lines.push([q(r.MES_REFERENCIA), r.SUBMERCADO, r.PERIODO_COMERCIALIZACAO, q(quoted ? r.DIA.padStart(2, '0') : r.DIA), q(quoted ? r.HORA.padStart(2, '0') : r.HORA), r.PLD_HORA].join(';'));
  }
  return lines.join(crlf ? '\r\n' : '\n');
}

test('splitLine handles quotes and doubled quotes', () => {
  assert.deepEqual(splitLine('"a";b;"c""d";'), ['a', 'b', 'c"d', '']);
});

test('both file shapes parse to the same rows and report their shape', () => {
  const rows = fixtureRows(2);
  const a = parsePldFile(toText(rows, { quoted: true, crlf: true }));
  const b = parsePldFile(toText(rows, { quoted: false, crlf: false, reverse: true }));
  assert.deepEqual(a.columns, HEADER);
  assert.deepEqual(a.shape, { quoted: true, lineEnding: 'CRLF', order: 'oldest first', zeroPaddedDays: null });
  assert.deepEqual(b.shape, { quoted: false, lineEnding: 'LF', order: 'newest first', zeroPaddedDays: 0 });
  assert.equal(runContract([file(a.rows)], '2021-01-02').status, 'passed');
  assert.equal(runContract([file(b.rows)], '2021-01-02').status, 'passed');
  assert.equal(monthDigests([file(a.rows)])['202101'], monthDigests([file(b.rows)])['202101']);
});

test('a clean fixture passes all 13 checks', () => {
  const res = runContract([file(fixtureRows(3))], '2021-01-04');
  assert.equal(res.checks.length, 13);
  assert.equal(res.status, 'passed');
  assert.deepEqual(res.causes, []);
});

test('a renamed price column is one cause that stops the two price checks', () => {
  const [f] = renameColumn([file(fixtureRows(2))], 'pld_horario_2021.csv:PLD_HORA=PLD');
  const res = runContract([f], '2021-01-02');
  assert.equal(res.status, 'failed');
  assert.equal(res.causes.length, 1);
  assert.deepEqual(res.causes[0].checks, ['file.columns', 'row.price_number', 'row.price_bounds']);
  assert.equal(check(res, 'row.price_number').status, 'not run');
  assert.equal(check(res, 'set.day_24_hours').status, 'pass');
});

test('a 23-hour day (as a daylight-saving change would make) fails day_24_hours only', () => {
  const rows = fixtureRows(2).filter((r) => !(r.DIA === '2' && r.HORA === '0' && r.SUBMERCADO === 'SUL'));
  const res = runContract([file(rows)], '2021-01-02');
  assert.equal(check(res, 'set.day_24_hours').bad, 1);
  assert.equal(check(res, 'set.all_submarkets').bad, 1);
  assert.equal(check(res, 'row.period').status, 'pass');
});

test('a 25-hour day fails day_24_hours and key_unique', () => {
  const rows = fixtureRows(1);
  rows.push({ ...rows[0] });
  const res = runContract([file(rows)], '2021-01-01');
  assert.equal(check(res, 'set.day_24_hours').bad, 1); // only the first NORDESTE day has the extra row
  assert.equal(check(res, 'set.key_unique').bad, 1);
});

test('a missing submarket, a missing day and an unknown code each fail their check', () => {
  const noSul = fixtureRows(1).filter((r) => r.SUBMERCADO !== 'SUL');
  assert.equal(check(runContract([file(noSul)], '2021-01-01'), 'set.all_submarkets').bad, 24);
  const gap = fixtureRows(3).filter((r) => r.DIA !== '2');
  const g = check(runContract([file(gap)], '2021-01-03'), 'set.no_missing_days');
  assert.deepEqual([g.bad, g.examples], [1, ['missing 2021-01-02']]);
  const code = fixtureRows(1).map((r) => (r.SUBMERCADO === 'SUL' ? { ...r, SUBMERCADO: 'S' } : r));
  assert.equal(check(runContract([file(code)], '2021-01-01'), 'row.submarket').bad, 24);
});

test('row checks catch a wrong period, a bad day, a wrong year and bad prices', () => {
  const rows = fixtureRows(1);
  rows[0] = { ...rows[0], PERIODO_COMERCIALIZACAO: '5' };
  rows[1] = { ...rows[1], PLD_HORA: '1.234,56' };
  rows[2] = { ...rows[2], PLD_HORA: '9999' };
  rows[3] = { ...rows[3], HORA: '24' };
  const res = runContract([file(rows)], '2021-01-01');
  assert.equal(check(res, 'row.period').bad, 2); // the changed period, and the row whose hour became 24
  assert.equal(check(res, 'row.price_number').bad, 1);
  assert.equal(check(res, 'row.price_bounds').bad, 1);
  assert.equal(check(res, 'row.hour').bad, 1);
  const feb30 = fixtureRows(1).map((r) => ({ ...r, MES_REFERENCIA: '202102', DIA: '30', PERIODO_COMERCIALIZACAO: String(29 * 24 + Number(r.HORA) + 1) }));
  assert.equal(check(runContract([file(feb30)], '2021-02-28'), 'row.day').bad, 96);
  assert.equal(check(runContract([file(fixtureRows(1), 'pld_horario_2022.csv')], '2021-01-01'), 'row.month').bad, 96);
});

test('freshness fails when the newest day is more than 3 days before retrieval', () => {
  const rows = fixtureRows(2);
  assert.equal(check(runContract([file(rows)], '2021-01-05'), 'set.fresh').status, 'pass');
  assert.equal(check(runContract([file(rows)], '2021-01-06'), 'set.fresh').status, 'fail');
});

test('compareRows finds changed, missing and new hours', () => {
  const before = fixtureRows(2);
  const after = fixtureRows(3).map((r) => (r.DIA === '1' && r.HORA === '5' && r.SUBMERCADO === 'NORTE' ? { ...r, PLD_HORA: '111.11' } : r))
    .filter((r) => !(r.DIA === '2' && r.HORA === '0' && r.SUBMERCADO === 'SUL'));
  const cmp = compareRows([file(before)], [file(after)]);
  assert.deepEqual(cmp.changed, [{ key: '202101|NORTE|1|5', before: 105, after: 111.11 }]);
  assert.deepEqual(cmp.removed, ['202101|SUL|2|0']);
  assert.equal(cmp.added, 96);
});

test('compareDigests names rewritten, new and gone months', () => {
  assert.deepEqual(compareDigests({ 202101: 'a', 202102: 'b', 202103: 'c' }, { 202101: 'a', 202102: 'x', 202104: 'd' }), { changed: ['202102'], added: ['202104'], removed: ['202103'] });
});

test('recordRun: same files twice add one snapshot; a rewritten value is reported as a restatement', () => {
  const results = emptyResults();
  const f1 = { ...file(fixtureRows(2)), sha256: 'h1', bytes: 1, shape: {} };
  recordRun(results, [f1], { retrieved: '2021-01-02', runDate: '2021-01-02' });
  const again = recordRun(results, [f1], { retrieved: '2021-01-02', runDate: '2021-01-03' });
  assert.equal(results.snapshots.length, 1);
  assert.equal(again.sameAsSnapshot, '2021-01-02');
  const rows = fixtureRows(3);
  rows[0] = { ...rows[0], PLD_HORA: '99.5' };
  const f2 = { ...file(rows), sha256: 'h2', bytes: 1, shape: {} };
  recordRun(results, [f2], { retrieved: '2021-01-03', runDate: '2021-01-03', previousFiles: [f1] });
  assert.equal(results.snapshots.length, 2);
  const cmp = results.comparisons[0];
  assert.deepEqual(cmp.months, { changed: ['202101'], added: [], removed: [] });
  assert.equal(cmp.rows.changedCount, 1);
  assert.equal(results.summary.last, '2021-01-03');
  const rehearsal = recordRun(results, [f2], { retrieved: '2021-01-03', runDate: '2021-01-03', rename: 'pld_horario_2021.csv:PLD_HORA=PLD' });
  assert.equal(rehearsal.status, 'failed');
  assert.equal(results.summary.last, '2021-01-03'); // a rehearsal never touches the figures
  assert.equal(results.snapshots.length, 2);
});

test('summary: a daily price is the mean of 24 hourly prices', () => {
  const s = summarise([file(fixtureRows(2))]);
  assert.equal(s.days, 2);
  assert.equal(s.daily.series.SUL[0], 111.5); // mean of 100..123
  assert.equal(s.yearly[0].max, 123);
});

test('the real files: 205,824 rows in six files pass all 13 checks', () => {
  const files = readFolder(join(ROOT, 'data/ccee-pld-horario'));
  assert.equal(files.length, 6);
  assert.equal(files.reduce((n, f) => n + f.rows.length, 0), 205824);
  const res = runContract(files, '2026-11-14');
  assert.equal(res.status, 'passed', JSON.stringify(res.causes));
  assert.deepEqual(files.map((f) => f.shape.quoted), [true, true, true, true, false, false]);
  assert.deepEqual(files.map((f) => f.shape.order), ['oldest first', 'oldest first', 'oldest first', 'oldest first', 'mixed', 'newest first']);
  // 2025 writes days 1 to 9 of Aug, Sep and Oct as "01" to "09": 9 days x 24 hours x 4 submarkets x 3 months.
  assert.equal(files[4].shape.zeroPaddedDays, 2592);
  assert.equal(files[5].shape.zeroPaddedDays, 0);
});
