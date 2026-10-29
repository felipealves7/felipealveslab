// Scorecard for model-written SQL: a fixed question set, the expected answer for each,
// and a scorer that runs any candidate SQL on a local copy of the seeded ledger.
// Expected answers come from pipelines/ask-the-ledger/gold.mjs, which reads the raw rows directly.

import { DatabaseSync } from 'node:sqlite';
import { buildLedger } from '../ask-the-ledger/ledger.mjs';
import { QUESTIONS, truth } from '../ask-the-ledger/gold.mjs';
import { SCHEMA_SQL } from './schema.mjs';
import { validateSql } from './validate.mjs';

export const SEED = 2027;

/** 12 questions with a figure and 3 where the right move is to decline. Texts match gold.mjs exactly. */
export const SCORECARD_TEXTS = [
  'What was total revenue in 2025?',
  'Revenue in Q1 2026',
  'What was gross profit in Q4 2025?',
  'What was the gross margin in 2025?',
  'Operating expenses in March 2026',
  'Revenue by entity in 2025',
  'Operating profit by entity in Q3 2026',
  'Which entity had the highest revenue in 2025?',
  'Top 3 entities by operating expenses in Q2 2026',
  'Operating profit for Delta Services in Q1 2026',
  'What was revenue last quarter?',
  'Quarterly operating profit in 2026',
  'What was the profit in 2025?',
  'What was EBITDA in 2025?',
  'Headcount by entity',
];

export function scorecardQuestions() {
  return SCORECARD_TEXTS.map((text, i) => {
    const q = QUESTIONS.find((x) => x.text === text);
    if (!q) throw new Error(`scorecard question not in gold set: ${text}`);
    return { id: i + 1, text, gold: q };
  });
}

export function openLedger(seed = SEED) {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA_SQL);
  const ins = db.prepare('INSERT INTO ledger (entity, month, account, grp, amount) VALUES (?, ?, ?, ?, ?)');
  for (const r of buildLedger({ seed })) ins.run(r.entity, r.month, r.account, r.group, r.amount);
  return db;
}

/** Same checks as the Worker, then run. Returns { ok, rows } or { ok: false, reason }. */
export function runSql(db, sql) {
  const v = validateSql(sql);
  if (!v.ok) return { ok: false, reason: v.reason };
  try {
    return { ok: true, sql: v.sql, rows: db.prepare(v.sql).all().map((r) => ({ ...r })) };
  } catch (e) {
    return { ok: false, reason: `query failed: ${e.message}` };
  }
}

const near = (a, b) => Math.abs(a - b) < 0.05;

/** Does a result match the expected one? Scalars: one row holding the number. Tables: same labels and values. */
export function matches(rows, expected) {
  if (expected.kind === 'scalar') {
    return rows.length === 1 && Object.values(rows[0]).some((v) => typeof v === 'number' && near(v, expected.value));
  }
  if (rows.length !== expected.rows.length) return false;
  const pool = rows.map((r) => ({ label: Object.values(r).find((v) => typeof v === 'string'), nums: Object.values(r).filter((v) => typeof v === 'number') }));
  return expected.rows.every((e) => {
    const k = pool.findIndex((p) => p.label === e.label && p.nums.some((n) => near(n, e.value)));
    if (k === -1) return false;
    pool.splice(k, 1);
    return true;
  });
}

/**
 * generated: [{ id, sql }] where sql is null if the model declined.
 * Returns the scorecard: one entry per question and an overall summary.
 */
export function scoreGenerated(generated, { seed = SEED } = {}) {
  const db = openLedger(seed);
  const rows = buildLedger({ seed });
  const entries = scorecardQuestions().map((q) => {
    const want = truth(rows, q.gold);
    const g = generated.find((x) => x.id === q.id);
    const entry = { id: q.id, text: q.text, expected: want.outcome === 'refuse' ? { outcome: 'decline' } : { outcome: 'answer', result: want.result } };
    if (!g) return { ...entry, status: 'not_run' };
    if (g.sql == null) return { ...entry, sql: null, status: want.outcome === 'refuse' ? 'correct' : 'wrong', note: want.outcome === 'refuse' ? 'Declined, as it should.' : 'Declined a question the ledger can answer.' };
    const ran = runSql(db, g.sql);
    if (!ran.ok) return { ...entry, sql: g.sql, status: 'wrong', note: `Rejected or failed: ${ran.reason}` };
    if (want.outcome === 'refuse') return { ...entry, sql: ran.sql, status: 'wrong', note: 'Answered a question it should have declined.' };
    return { ...entry, sql: ran.sql, got: ran.rows, status: matches(ran.rows, want.result) ? 'correct' : 'wrong' };
  });
  const run = entries.filter((e) => e.status !== 'not_run');
  const correct = run.filter((e) => e.status === 'correct').length;
  return { total: entries.length, run: run.length, correct, accuracy: run.length ? Math.round((correct / run.length) * 1000) / 10 : null, entries };
}
