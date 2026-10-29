import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildLedger, monthList, ENTITIES, ACCOUNTS } from './ledger.mjs';
import { execute, quarterOf } from './semantic.mjs';
import { translate } from './translate.mjs';
import { QUESTIONS } from './gold.mjs';
import { buildResults, judge, score, sameResult, OUTPUTS, SEED } from './evaluate.mjs';

const rows = buildLedger({ seed: SEED });

test('ledger has one row per entity, month and account, and is repeatable', () => {
  assert.equal(monthList().length, 21);
  assert.equal(rows.length, ENTITIES.length * 21 * ACCOUNTS.length);
  assert.deepEqual(buildLedger({ seed: SEED }), rows);
  assert.notDeepEqual(buildLedger({ seed: SEED + 1 }), rows);
  assert.ok(rows.every((r) => Number.isInteger(r.amount) && r.amount > 0));
});

test('metrics follow their written definitions on a tiny hand-made ledger', () => {
  const tiny = [
    { entity: 'A', month: '2026-01', account: 'Product sales', group: 'Revenue', amount: 100 },
    { entity: 'A', month: '2026-01', account: 'Materials', group: 'Cost of sales', amount: 40 },
    { entity: 'A', month: '2026-01', account: 'Payroll', group: 'Operating expense', amount: 25 },
    { entity: 'B', month: '2026-02', account: 'Product sales', group: 'Revenue', amount: 200 },
  ];
  const run = (metric, extra = {}) => execute(tiny, { metric, from: '2026-01', to: '2026-02', ...extra });
  assert.deepEqual(run('revenue'), { kind: 'scalar', value: 300 });
  assert.deepEqual(run('gross_profit'), { kind: 'scalar', value: 260 });
  assert.deepEqual(run('operating_profit'), { kind: 'scalar', value: 235 });
  assert.deepEqual(run('gross_margin'), { kind: 'scalar', value: 86.7 });
  assert.deepEqual(run('revenue', { groupBy: 'entity', rank: { dir: 'desc', n: 1 } }), { kind: 'table', rows: [{ label: 'B', value: 200 }] });
  assert.deepEqual(run('revenue', { from: '2027-01', to: '2027-02' }), { kind: 'no_data' });
});

test('quarters are counted from calendar months', () => {
  assert.equal(quarterOf('2026-03'), '2026-Q1');
  assert.equal(quarterOf('2026-04'), '2026-Q2');
  assert.equal(quarterOf('2025-12'), '2025-Q4');
});

test('translator asks back on ambiguous words and refuses unsupported ones', () => {
  assert.equal(translate('What was profit in 2025?').reason, 'ambiguous_metric');
  assert.equal(translate('Costs in 2025').reason, 'ambiguous_metric');
  assert.equal(translate('EBITDA in 2025').reason, 'unsupported');
  assert.equal(translate('Tell me about sandwiches').reason, 'unknown_metric');
  // "sales" inside "cost of sales" must not turn this into a revenue question
  assert.equal(translate('Cost of sales in 2025').spec.metric, 'cost_of_sales');
});

test('translator reads periods, entities and rankings', () => {
  const s = translate('Top 3 entities by opex in Q2 2026').spec;
  assert.deepEqual([s.metric, s.from, s.to, s.groupBy, s.rank.n], ['opex', '2026-04', '2026-06', 'entity', 3]);
  assert.equal(translate('revenue of north hub in 2025').spec.entity, 'North Hub');
  assert.equal(translate('revenue last quarter').spec.from, '2026-07');
});

test('the judge scores each kind of outcome', () => {
  const answerQ = QUESTIONS.find((q) => q.text === 'What was total revenue in 2025?');
  const refuseQ = QUESTIONS.find((q) => q.text === 'What was EBITDA in 2025?');
  const spec = (over = {}) => ({ outcome: 'answer', spec: { metric: 'revenue', from: '2025-01', to: '2025-12', ...over } });
  assert.equal(judge(rows, answerQ, () => spec()).verdict, 'correct_answer');
  assert.equal(judge(rows, answerQ, () => spec({ to: '2025-11' })).verdict, 'wrong_answer');
  assert.equal(judge(rows, answerQ, () => ({ outcome: 'refuse', reason: 'unknown_metric' })).verdict, 'wrongly_refused');
  assert.equal(judge(rows, refuseQ, () => ({ outcome: 'refuse', reason: 'unsupported' })).verdict, 'correct_refusal');
  assert.equal(judge(rows, refuseQ, () => spec()).verdict, 'wrong_answer');
  assert.ok(sameResult({ kind: 'scalar', value: 1 }, { kind: 'scalar', value: 1 }));
  assert.ok(!sameResult({ kind: 'scalar', value: 1 }, { kind: 'table', rows: [] }));
});

test('every answer question has a different true value from a wrong one (the check can fail)', () => {
  const fake = () => ({ outcome: 'answer', spec: { metric: 'revenue', from: '2030-01', to: '2030-02' } });
  const judged = QUESTIONS.map((q) => judge(rows, q, fake));
  assert.equal(judged.filter((j) => j.verdict === 'correct_answer').length, 0);
});

test('the summary adds up', () => {
  const s = buildResults().summary;
  assert.equal(s.correct_answer + s.correct_refusal + s.wrong_answer + s.wrongly_refused, s.total);
  assert.equal(s.total, QUESTIONS.length);
  assert.equal(Object.values(s.byType).reduce((n, t) => n + t.total, 0), s.total);
});

test('cached results on disk match a fresh run', () => {
  const fresh = JSON.stringify(buildResults(), null, 2) + '\n';
  for (const file of OUTPUTS) assert.equal(readFileSync(file, 'utf8'), fresh, `${file} is out of date; run node pipelines/ask-the-ledger/evaluate.mjs`);
});

test('scoring a perfect translator gives full marks', () => {
  const perfect = QUESTIONS.map((q) => ({ id: q.id, type: q.type, verdict: q.gold === 'refuse' ? 'correct_refusal' : 'correct_answer' }));
  const s = score(perfect);
  assert.equal(s.correct_answer + s.correct_refusal, s.total);
});

test('the Lab page quotes the numbers and definitions the code produces', () => {
  const md = readFileSync(new URL('../../src/content/lab/ask-the-ledger.md', import.meta.url), 'utf8');
  const r = buildResults();
  const s = r.summary;
  assert.ok(md.includes(`right on ${s.correct_answer + s.correct_refusal} of ${s.total}`), 'headline score is out of date');
  assert.ok(md.includes(`${s.wrong_answer} wrong answers`), 'wrong-answer count is out of date');
  assert.ok(md.includes(`${s.wrongly_refused} questions wrongly declined`), 'wrongly-declined count is out of date');
  for (const m of r.semanticLayer) assert.ok(md.includes(m.definition), `definition missing: ${m.key}`);
  for (const [kind, t] of Object.entries(s.byType)) assert.ok(md.includes(`| ${t.right} | ${t.total} |`), `${kind} row is out of date`);
});
