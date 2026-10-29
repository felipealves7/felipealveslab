// Runs SQL on a local SQLite copy of the ledger (node:sqlite) and scores generated queries against the reference queries.
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL, buildDataset } from './dataset.mjs';
import { QUESTIONS } from './questions.mjs';
import { validateSql } from '../../worker/ledger-api/src/validate.mjs';

export function openDb(data = buildDataset()) {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA_SQL);
  for (const [table, rows] of Object.entries(data)) {
    const cols = Object.keys(rows[0]);
    const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
    for (const r of rows) stmt.run(...cols.map((c) => r[c]));
  }
  return db;
}

const norm = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
const rowKey = (row) => JSON.stringify(Object.values(row).map(norm));

/** Same rows, ignoring column names; ignoring order unless the reference query is ordered. */
export function sameResult(got, want, ordered = false) {
  if (got.length !== want.length) return false;
  const a = got.map(rowKey);
  const b = want.map(rowKey);
  if (!ordered) {
    a.sort();
    b.sort();
  }
  return a.every((x, i) => x === b[i]);
}

export function run(db, sql) {
  return db.prepare(sql).all().map((r) => ({ ...r }));
}

/** @param generated {Record<number, string>} question id -> SQL the model wrote */
export function buildScorecard(db, generated = {}) {
  const questions = QUESTIONS.map((q) => {
    const expected = run(db, q.sql);
    const base = { id: q.id, text: q.text, referenceSql: q.sql, expected: expected.slice(0, 5), expectedRows: expected.length };
    const sql = generated[q.id];
    if (sql === undefined) return { ...base, verdict: 'not_run', generatedSql: null };
    const checked = validateSql(sql);
    if (!checked.ok) return { ...base, verdict: 'rejected', generatedSql: sql, detail: checked.reason };
    try {
      const got = run(db, checked.sql);
      return { ...base, verdict: sameResult(got, expected, q.ordered) ? 'right' : 'wrong', generatedSql: checked.sql, got: got.slice(0, 5) };
    } catch (e) {
      return { ...base, verdict: 'error', generatedSql: checked.sql, detail: String(e.message) };
    }
  });
  const ran = questions.filter((q) => q.verdict !== 'not_run').length;
  const right = questions.filter((q) => q.verdict === 'right').length;
  return { total: questions.length, ran, right, accuracy: ran ? right / ran : null, questions };
}
