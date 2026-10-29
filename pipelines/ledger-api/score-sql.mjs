// Scores model-written SQL against the 47-question test set from Ask the Ledger.
// Each query goes through the same validator as the Worker, then runs on an in-memory SQLite copy
// of the seeded ledger (node:sqlite, built into Node 22).
//
//   node pipelines/ledger-api/score-sql.mjs                 -> writes a scorecard with status "not_run"
//   node pipelines/ledger-api/score-sql.mjs queries.json    -> scores [{ "id": 1, "sql": "SELECT ..." | null }, ...]
//
// queries.json comes from generate-queries.mjs, which calls the model. Nothing here invents a result.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLedger } from '../ask-the-ledger/ledger.mjs';
import { QUESTIONS, truth } from '../ask-the-ledger/gold.mjs';
import { SCHEMA_SQL } from './build-sql.mjs';
import { validateSql } from './validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function openLedger(rows = buildLedger()) {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA_SQL);
  const ins = db.prepare('INSERT INTO ledger VALUES (?,?,?,?,?)');
  for (const r of rows) ins.run(r.entity, r.month, r.account, r.group, r.amount);
  return db;
}

const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 0.05;

/** Does a result set contain the gold figure(s)? */
export function matchesGold(rows, gold) {
  if (gold.kind === 'scalar') {
    return rows.length === 1 && Object.values(rows[0]).some((v) => near(v, gold.value));
  }
  if (rows.length !== gold.rows.length) return false;
  const used = new Set();
  return gold.rows.every((g) => {
    const i = rows.findIndex((r, k) => !used.has(k) && Object.values(r).includes(g.label) && Object.values(r).some((v) => near(v, g.value)));
    if (i === -1) return false;
    used.add(i);
    return true;
  });
}

/** One question. generated: the query the model wrote (string), or null when it declined. */
export function judgeSql(db, ledgerRows, question, generated) {
  const want = truth(ledgerRows, question);
  const base = { id: question.id, text: question.text, type: question.type, want, sql: generated };
  if (generated === null) return { ...base, verdict: want.outcome === 'refuse' ? 'correct_refusal' : 'wrongly_refused' };
  const checked = validateSql(generated);
  if (!checked.ok) return { ...base, verdict: 'rejected_sql', note: checked.reason };
  let rows;
  try {
    rows = db.prepare(checked.sql).all().slice(0, 100).map((r) => ({ ...r }));
  } catch (e) {
    return { ...base, verdict: 'query_error', note: String(e.message).slice(0, 120) };
  }
  if (want.outcome === 'refuse') return { ...base, rows, verdict: 'wrong_answer' };
  return { ...base, rows, verdict: matchesGold(rows, want.result) ? 'correct_answer' : 'wrong_answer' };
}

export function buildScorecard(queries, meta = {}) {
  const ledgerRows = buildLedger();
  const generatedBy = new Map((queries ?? []).map((q) => [q.id, q]));
  const common = { generatedAt: meta.generatedAt ?? null, model: meta.model ?? null };
  if (!queries) {
    return {
      status: 'not_run',
      ...common,
      note: 'No model has been scored yet. Run generate-queries.mjs, then score-sql.mjs with its output.',
      summary: { total: QUESTIONS.length },
      questions: QUESTIONS.map((q) => ({ id: q.id, text: q.text, type: q.type, want: truth(ledgerRows, q) })),
    };
  }
  const db = openLedger(ledgerRows);
  const questions = QUESTIONS.map((q) => {
    const g = generatedBy.get(q.id);
    if (!g || g.error) return { id: q.id, text: q.text, type: q.type, want: truth(ledgerRows, q), sql: null, verdict: 'model_error' };
    return judgeSql(db, ledgerRows, q, g.sql ?? null);
  });
  const count = (v) => questions.filter((j) => j.verdict === v).length;
  const right = count('correct_answer') + count('correct_refusal');
  return {
    status: 'scored',
    ...common,
    summary: {
      total: questions.length,
      right,
      accuracy_percent: Math.round((right / questions.length) * 1000) / 10,
      correct_answer: count('correct_answer'),
      correct_refusal: count('correct_refusal'),
      wrong_answer: count('wrong_answer'),
      wrongly_refused: count('wrongly_refused'),
      rejected_sql: count('rejected_sql'),
      query_error: count('query_error'),
      model_error: count('model_error'),
    },
    questions,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  const queries = file ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const card = buildScorecard(queries, { generatedAt: file ? new Date().toISOString().slice(0, 10) : null, model: process.env.SCORED_MODEL ?? null });
  const text = JSON.stringify(card, null, 2) + '\n';
  for (const dir of ['data/ledger-api', 'public/data/ledger-api']) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, 'scorecard.json'), text);
  }
  console.log(card.status === 'scored' ? `scored: ${card.summary.right} of ${card.summary.total}` : 'wrote scorecard with status not_run');
}
