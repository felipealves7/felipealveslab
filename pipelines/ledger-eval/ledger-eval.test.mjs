import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { cases, legacyCases, validationCases, referenceSql, independentExpected } from './cases.mjs';
import { scenarios } from './scenarios.mjs';
import { strictMatch, evaluateSql, summarize } from './scoring.mjs';
import { evaluateSafely } from './safe-scoring.mjs';
import { actualUsage, reserveNeurons, infer } from './cloudflare.mjs';
import { measurements } from './measurement.mjs';
import { buildResults } from '../ask-the-ledger/evaluate.mjs';
import { matchesGold, openLedger } from '../ledger-api/score-sql.mjs';
import { validateSql } from '../ledger-api/validate.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const runner = fileURLToPath(new URL('./run.mjs', import.meta.url));

// ---------- question sets ----------
test('the keyword rules baseline still scores 40 of 47, with all four paraphrases wrong', () => {
  const s = buildResults().summary;
  assert.equal(s.correct_answer + s.correct_refusal, 40);
  assert.equal(s.total, 47);
  assert.equal(s.byType.paraphrase.right, 0);
});

test('47 page questions and 20 validation questions, all distinct', () => {
  assert.equal(legacyCases.length, 47);
  assert.equal(validationCases.length, 20);
  assert.equal(new Set(cases.map((c) => c.id)).size, 67);
  assert.equal(new Set(cases.map((c) => c.text)).size, 67);
});

test('every page question with a scope expects an answer, and every one without expects a refusal', () => {
  const rows = scenarios()[0].rows;
  for (const c of legacyCases) assert.equal(c.spec === null, c.expected(rows).outcome === 'refuse', c.id);
});

test('margins are computed from summed amounts, not by averaging percentages', () => {
  const rows = [['A', 'Product sales', 100], ['A', 'Materials', 50], ['B', 'Product sales', 900], ['B', 'Materials', 90]]
    .map(([entity, account, amount]) => ({ entity, account, amount, month: '2025-01' }));
  assert.equal(independentExpected(rows, { metric: 'gross_margin', from: '2025-01', to: '2025-01' }).result.value, 86);
});

test('zero revenue keeps the page convention (margin 0); a period with no rows is declined', () => {
  const world = scenarios().find((w) => w.name === 'zero_revenue');
  assert.equal(legacyCases[4].expected(world.rows).result.value, 0);
  assert.equal(independentExpected([], { metric: 'revenue', from: '2025-01', to: '2025-12' }).outcome, 'refuse');
});

for (const world of scenarios()) {
  test(`hand-written reference SQL agrees with the independent answers: ${world.name}`, () => {
    for (const c of cases) {
      const r = evaluateSql(world.rows, c, referenceSql(c.spec));
      assert.ok(['correct_answer', 'correct_refusal'].includes(r.verdict), JSON.stringify(r));
    }
  });
}

// ---------- scoring ----------
test('the older scorer passes a wrong answer with the right number in another column; the strict one does not', () => {
  const rows = [{ wrong_answer: 0, unrelated: 181141 }];
  const gold = { kind: 'scalar', value: 181141 };
  assert.equal(matchesGold(rows, gold), true);
  assert.equal(strictMatch(rows, gold), false);
});

test('scalar answers: one numeric cell, exact amounts', () => {
  const g = { kind: 'scalar', value: 100 };
  assert.equal(strictMatch([{ answer: 100 }], g), true);
  assert.equal(strictMatch([{ answer: '100' }], g), false);
  assert.equal(strictMatch([{ answer: 100.01 }], g), false);
  assert.equal(strictMatch([{ answer: null }], g), false);
  assert.equal(strictMatch([{ answer: 100 }, { answer: 100 }], g), false);
  assert.equal(strictMatch([{ answer: NaN }], g), false);
});

test('grouped answers pair each label with its one number, in any order', () => {
  const gold = { kind: 'table', rows: [{ label: 'A', value: 10 }, { label: 'B', value: 20 }] };
  assert.equal(strictMatch([{ entity: 'B', total: 20 }, { entity: 'A', total: 10 }], gold), true);
  assert.equal(strictMatch([{ entity: 'A', total: 20 }, { entity: 'B', total: 10 }], gold), false);
  assert.equal(strictMatch([{ entity: 'A', total: 10 }, { entity: 'A', total: 20 }], gold), false);
  assert.equal(strictMatch([{ entity: 'A', total: 0, other: 10 }, { entity: 'B', total: 20 }], gold), false);
});

test('the ±0.05 tolerance applies to gross margin only', () => {
  const g = { kind: 'scalar', value: 48.2 };
  assert.equal(strictMatch([{ x: 48.21 }], g, { ratio: true }), true);
  assert.equal(strictMatch([{ x: 48.3 }], g, { ratio: true }), false);
  assert.equal(strictMatch([{ x: 48.21 }], g), false);
});

test('right figures in the wrong shape are flagged but still scored wrong', () => {
  const rows = scenarios()[0].rows;
  const revenue2025 = legacyCases[0];
  const extraColumn = evaluateSql(rows, revenue2025, "SELECT 'Revenue' AS metric, SUM(amount) AS value FROM ledger WHERE account_group = 'Revenue' AND month LIKE '2025-%'");
  assert.equal(extraColumn.verdict, 'wrong_answer');
  assert.equal(extraColumn.note, 'right figures, wrong shape');
  const top = legacyCases.find((c) => c.text === 'Which entity had the highest revenue in 2025?');
  const nameOnly = evaluateSql(rows, top, "SELECT entity FROM ledger WHERE account_group = 'Revenue' AND month LIKE '2025-%' GROUP BY entity ORDER BY SUM(amount) DESC LIMIT 1");
  assert.equal(nameOnly.verdict, 'wrong_answer');
  assert.equal(nameOnly.note, 'right figures, wrong shape');
  const wrong = evaluateSql(rows, revenue2025, "SELECT SUM(amount) AS value FROM ledger WHERE account_group = 'Revenue'");
  assert.equal(wrong.note, undefined);
  assert.equal(summarize([extraColumn, nameOnly, wrong]).wrong_shape_right_figures, 2);
});

test('a missing model reply is a model error, never a correct refusal', () => {
  const c = cases.find((x) => x.type === 'ambiguous');
  const r = evaluateSql(scenarios()[0].rows, c, null, { error: true });
  assert.equal(r.verdict, 'model_error');
  assert.equal(summarize([r]).right, 0);
});

test('a constant answer passes the original ledger and fails the others', () => {
  const sql = 'SELECT 181141 AS value FROM ledger LIMIT 1';
  assert.equal(evaluateSql(scenarios()[0].rows, legacyCases[0], sql).verdict, 'correct_answer');
  assert.equal(evaluateSql(scenarios()[1].rows, legacyCases[0], sql).verdict, 'wrong_answer');
});

test('generated SQL is checked with the live validator before it runs', () => {
  const r = evaluateSql(scenarios()[0].rows, legacyCases[0], 'DROP TABLE ledger');
  assert.equal(r.verdict, 'rejected_sql');
  assert.equal(r.reason, validateSql('DROP TABLE ledger').reason);
});

test('the scoring database is read-only on its own', () => {
  const db = openLedger();
  try {
    db.exec('PRAGMA query_only = ON');
    assert.throws(() => db.exec('DELETE FROM ledger'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ledger').get().n, 1008);
  } finally {
    db.close();
  }
});

test('a slow query that passes the validator is killed by the isolated scorer', async () => {
  // Correlated subqueries still pass the validator and are roughly a billion steps here.
  const sql = 'SELECT COUNT(*) AS value FROM ledger a WHERE (SELECT COUNT(*) FROM ledger b WHERE b.amount <= a.amount AND (SELECT COUNT(*) FROM ledger c WHERE c.amount <= b.amount) > 0) > 0';
  assert.equal(validateSql(sql).ok, true);
  const start = performance.now();
  const r = await evaluateSafely(scenarios()[0].rows, legacyCases[0], sql, { timeoutMs: 250 });
  assert.equal(r.verdict, 'query_timeout');
  assert.ok(performance.now() - start < 5000, 'the query must be stopped, not left running');
});

// ---------- prompts, usage and the runner ----------
test('the candidate prompt states the October 2026 reporting month, the product scope and summed ratios', () => {
  const p = readFileSync(new URL('./candidate-prompt.txt', import.meta.url), 'utf8');
  assert.match(p, /October 2026/);
  assert.match(p, /Product policy/);
  assert.match(p, /ratios from summed amounts/);
});

test('usage accounting refuses missing or malformed token counts', () => {
  const rates = { inputNeuronsPerMillion: 60000, outputNeuronsPerMillion: 90909 };
  assert.equal(actualUsage({}, rates), null);
  assert.equal(actualUsage({ usage: { prompt_tokens: -1, completion_tokens: 1 } }, rates), null);
  assert.deepEqual(actualUsage({ usage: { prompt_tokens: 1000, completion_tokens: 400 } }, rates), { inputTokens: 1000, outputTokens: 400, pricingDerivedNeurons: 96.3636 });
  assert.ok(reserveNeurons([{ role: 'user', content: 'hello' }], rates) > 36.3636);
});

test('measurements keep figures right, decisions right and billed cost apart', () => {
  const records = [100, 300, 200].map((elapsedMs) => ({ elapsedMs, usage: { inputTokens: 10, outputTokens: 20, pricingDerivedNeurons: 100 } }));
  const m = measurements(records, { correct_answer: 2, right: 3 });
  assert.equal(m.responseTiming.p50Ms, 200);
  assert.equal(m.responseTiming.p95Ms, 300);
  assert.equal(m.usage.pricingDerivedNeurons, 300);
  assert.equal(m.usage.listPriceEquivalentUsd, (300 * 0.011) / 1000);
  assert.equal(m.usage.listPriceUsdPerCorrectNumericAnswer, (300 * 0.011) / 1000 / 2);
  assert.equal(m.usage.actualBilledUsd, null);
});

test('missing usage and zero right answers give unknown costs, not zeroes', () => {
  const m = measurements([{ elapsedMs: null, usage: null }], { correct_answer: 0, right: 0 });
  assert.equal(m.usage.listPriceEquivalentUsd, null);
  assert.equal(m.usage.listPriceUsdPerCorrectNumericAnswer, null);
  assert.equal(m.responseTiming.meanMs, null);
});

test('the REST client sends max_tokens 400 and temperature 0 (mocked; not a model result)', async () => {
  let request;
  const result = await infer({
    account: 'test-account',
    token: 'test-token-not-a-real-secret',
    model: 'test-model',
    messages: [{ role: 'user', content: 'test' }],
    fetchFn: async (url, init) => {
      request = { url, body: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ success: true, result: { response: 'test' } }) };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(request.body.max_tokens, 400);
  assert.equal(request.body.temperature, 0);
  assert.equal(request.body.messages.length, 1);
});

test('model options from models.json are sent but cannot change the cap, the temperature or the messages (mocked)', async () => {
  let body;
  await infer({
    account: 'test-account',
    token: 'test-token-not-a-real-secret',
    model: 'test-model',
    messages: [{ role: 'user', content: 'test' }],
    options: { chat_template_kwargs: { enable_thinking: false }, max_tokens: 9999, temperature: 1, messages: [] },
    fetchFn: async (url, init) => {
      body = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ success: true, result: { response: 'test' } }) };
    },
  });
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
  assert.equal(body.max_tokens, 400);
  assert.equal(body.temperature, 0);
  assert.equal(body.messages.length, 1);
});

test('every model in models.json has rates, and paid-only models are not offered', () => {
  const config = JSON.parse(readFileSync(new URL('./models.json', import.meta.url), 'utf8'));
  for (const [id, m] of Object.entries(config.models)) {
    assert.ok(m.inputNeuronsPerMillion > 0 && m.outputNeuronsPerMillion > 0, id);
    assert.ok(!(id in config.notOffered), `${id} is listed as not offered`);
  }
});

test('a dry run needs no credentials and makes no network calls', () => {
  const r = spawnSync(process.execPath, [runner, '--dry-run'], { cwd: here, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.networkCalls, 0);
  assert.equal(plan.prompt, 'baseline');
});

test('a real run stops before any request when credentials or the free-plan flag are missing', () => {
  const env = { ...process.env };
  delete env.CF_ACCOUNT_ID;
  delete env.CF_API_TOKEN;
  delete env.LEDGER_ACCOUNT_PLAN;
  const r = spawnSync(process.execPath, [runner, '--out', 'unused.json'], { cwd: here, encoding: 'utf8', env });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /BLOCKED/);
});
