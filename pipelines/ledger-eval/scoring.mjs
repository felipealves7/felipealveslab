// Scores one generated query for one case: check it with the live Worker's validator, run it on a
// read-only in-memory copy of a ledger, then compare it strictly with the expected answer.
import { openLedger } from '../ledger-api/score-sql.mjs';
import { validateSql, MAX_ROWS } from '../ledger-api/validate.mjs';

export const PERCENT_TOLERANCE = 0.050000001; // gross margin only: one decimal place, ±0.05 points
const SHAPE_NOTE = 'right figures, wrong shape';

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const nearFn = (ratio) => (a, b) => isNumber(a) && (ratio ? Math.abs(a - b) <= PERCENT_TOLERANCE : a === b);

/**
 * Exact shape. A scalar is one row with exactly one numeric cell. A table has one row per expected
 * row, each with exactly one text label and one number. Row order is ignored; amounts must be exact.
 * The page's older scorer accepted any matching number in any column, so a wrong answer could pass.
 */
export function strictMatch(rows, gold, { ratio = false } = {}) {
  const near = nearFn(ratio);
  if (!Array.isArray(rows)) return false;
  if (gold.kind === 'scalar') return rows.length === 1 && Object.keys(rows[0]).length === 1 && near(Object.values(rows[0])[0], gold.value);
  if (gold.kind !== 'table' || rows.length !== gold.rows.length) return false;
  const used = new Set();
  for (const want of gold.rows) {
    const i = rows.findIndex((r, k) => {
      const values = Object.values(r);
      return !used.has(k) && values.length === 2
        && values.filter((v) => typeof v === 'string').length === 1 && values.includes(want.label)
        && values.filter(isNumber).length === 1 && values.some((v) => near(v, want.value));
    });
    if (i < 0) return false;
    used.add(i);
  }
  return true;
}

/** The expected numbers are there, in some other shape. Reported separately, never scored right. */
function sameFigures(rows, gold, ratio) {
  const near = nearFn(ratio);
  if (gold.kind === 'scalar') return rows.length === 1 && Object.values(rows[0]).some((v) => near(v, gold.value));
  if (rows.length !== gold.rows.length) return false;
  const used = new Set();
  return gold.rows.every((want) => {
    const i = rows.findIndex((r, k) => !used.has(k) && Object.values(r).some((v) => near(v, want.value)));
    if (i >= 0) used.add(i);
    return i >= 0;
  });
}

/** For "which entity" questions: the right names, without the figures. */
function sameLabels(rows, gold) {
  return gold.kind === 'table' && rows.length === gold.rows.length
    && gold.rows.every((want) => rows.some((r) => Object.values(r).includes(want.label)));
}

export function evaluateSql(ledgerRows, c, generated, { error = false, guard = validateSql } = {}) {
  const want = c.expected(ledgerRows);
  const base = { id: c.id, text: c.text, suite: c.suite, type: c.type, want, sql: generated };
  if (error) return { ...base, verdict: 'model_error' };
  if (generated === null) return { ...base, verdict: want.outcome === 'refuse' ? 'correct_refusal' : 'wrongly_refused' };
  const checked = guard(generated);
  if (!checked.ok) return { ...base, verdict: 'rejected_sql', reason: checked.reason };
  const db = openLedger(ledgerRows);
  db.exec('PRAGMA query_only = ON');
  try {
    const rows = db.prepare(checked.sql).all().map((r) => ({ ...r }));
    if (rows.length > MAX_ROWS) return { ...base, verdict: 'row_limit_failure', returnedRows: rows.length };
    if (want.outcome !== 'answer') return { ...base, rows, verdict: 'wrong_answer' }; // answered what should be declined
    const ratio = c.spec?.metric === 'gross_margin';
    if (strictMatch(rows, want.result, { ratio })) return { ...base, rows, verdict: 'correct_answer' };
    const shapeOnly = sameFigures(rows, want.result, ratio) || (Boolean(c.spec?.rank) && sameLabels(rows, want.result));
    return { ...base, rows, verdict: 'wrong_answer', ...(shapeOnly ? { note: SHAPE_NOTE } : {}) };
  } catch (e) {
    return { ...base, verdict: 'query_error', reason: String(e.message).slice(0, 200) };
  } finally {
    db.close();
  }
}

export function summarize(results) {
  const count = (v) => results.filter((r) => r.verdict === v).length;
  const right = count('correct_answer') + count('correct_refusal');
  const answerable = results.filter((r) => r.want?.outcome === 'answer').length;
  const expectedRefusals = results.filter((r) => r.want?.outcome === 'refuse').length;
  const byType = {};
  for (const r of results) {
    byType[r.type] ??= { total: 0, right: 0 };
    byType[r.type].total++;
    if (['correct_answer', 'correct_refusal'].includes(r.verdict)) byType[r.type].right++;
  }
  const pct = (n, d) => (d ? (n / d) * 100 : null);
  return {
    total: results.length,
    right,
    accuracyPercent: pct(right, results.length),
    answerable,
    expectedRefusals,
    numericAnswerAccuracyPercent: pct(count('correct_answer'), answerable),
    refusalAccuracyPercent: pct(count('correct_refusal'), expectedRefusals),
    correct_answer: count('correct_answer'),
    correct_refusal: count('correct_refusal'),
    wrong_answer: count('wrong_answer'),
    wrong_shape_right_figures: results.filter((r) => r.note === SHAPE_NOTE).length,
    wrongly_refused: count('wrongly_refused'),
    rejected_sql: count('rejected_sql'),
    query_error: count('query_error'),
    query_timeout: count('query_timeout'),
    model_error: count('model_error'),
    row_limit_failure: count('row_limit_failure'),
    byType,
  };
}
