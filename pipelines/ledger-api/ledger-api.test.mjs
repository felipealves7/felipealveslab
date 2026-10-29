import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSql } from './validate.mjs';
import { handle, parseModelReply, generate, LIMITS, ORIGIN, RECORDED_SESSION } from './worker.mjs';
import { SCHEMA_SQL, buildSeedSql } from './build-sql.mjs';
import { openLedger, judgeSql, buildScorecard, matchesGold } from './score-sql.mjs';
import { buildSession } from './record-session.mjs';
import { buildLedger } from '../ask-the-ledger/ledger.mjs';
import { QUESTIONS } from '../ask-the-ledger/gold.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

// ---------- validator ----------
test('accepts a plain SELECT and appends LIMIT 100', () => {
  const v = validateSql("SELECT entity, SUM(amount) FROM ledger WHERE account_group = 'Revenue' GROUP BY entity;");
  assert.equal(v.ok, true);
  assert.match(v.sql, /LIMIT 100$/);
  assert.ok(!v.sql.includes(';'));
});

test('keeps an existing top-level LIMIT, and adds one when only a subquery has it', () => {
  assert.equal(validateSql('SELECT * FROM ledger LIMIT 5').sql, 'SELECT * FROM ledger LIMIT 5');
  assert.match(validateSql('SELECT * FROM (SELECT * FROM ledger LIMIT 5)').sql, /LIMIT 100$/);
});

test('accepts WITH, joins on the ledger and a CTE name', () => {
  assert.equal(validateSql('WITH t AS (SELECT entity, amount FROM ledger) SELECT entity FROM t').ok, true);
  assert.equal(validateSql('SELECT a.entity FROM ledger a JOIN ledger b ON a.entity = b.entity').ok, true);
});

for (const [name, sql] of [
  ['DROP', 'DROP TABLE ledger'],
  ['second statement', 'SELECT 1 FROM ledger; DROP TABLE ledger'],
  ['second statement after SELECT only', 'SELECT 1 FROM ledger; SELECT 2 FROM ledger'],
  ['DELETE in a CTE', 'WITH x AS (DELETE FROM ledger RETURNING *) SELECT * FROM x'],
  ['INSERT', 'INSERT INTO ledger VALUES (1)'],
  ['UPDATE', 'UPDATE ledger SET amount = 0'],
  ['ATTACH', 'ATTACH DATABASE x AS y'],
  ['PRAGMA', 'PRAGMA table_info(ledger)'],
  ['REPLACE', 'REPLACE INTO ledger VALUES (1)'],
  ['table outside the schema', 'SELECT * FROM sqlite_master'],
  ['table outside the schema in a join', 'SELECT * FROM ledger JOIN users ON 1=1'],
  ['table outside the schema after a comma', 'SELECT * FROM ledger, users'],
  ['table in a subquery', 'SELECT * FROM (SELECT * FROM secrets)'],
  ['schema-qualified table', 'SELECT * FROM main.ledger'],
  ['table-valued function', 'SELECT * FROM pragma_table_info(1)'],
  ['comment', 'SELECT 1 FROM ledger -- hi'],
  ['quoted identifier', 'SELECT * FROM "users"'],
  ['not a select', 'EXPLAIN SELECT 1'],
  ['empty', '   '],
]) {
  test(`rejects: ${name}`, () => assert.equal(validateSql(sql).ok, false));
}

test('a semicolon or keyword inside a string literal is not a violation', () => {
  assert.equal(validateSql("SELECT * FROM ledger WHERE account = 'a; DROP b'").ok, true);
});

// ---------- worker ----------
function makeEnv({ rows = [{ n: 1 }], kv = {} } = {}) {
  const store = new Map(Object.entries(kv));
  const ran = [];
  return {
    ran,
    store,
    COUNTERS: { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) },
    LEDGER: { prepare: (sql) => ({ all: async () => (ran.push(sql), { results: rows }) }) },
  };
}
const NOW = () => new Date('2026-11-24T10:00:00Z');
function req(body, { origin = ORIGIN, method = 'POST', ip = '203.0.113.7' } = {}) {
  return new Request('https://ledger-api.example/', {
    method,
    headers: { Origin: origin, 'CF-Connecting-IP': ip, 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}
function spy(reply = { sql: 'SELECT SUM(amount) AS n FROM ledger', explanation: 'Adds everything.' }) {
  const calls = [];
  return { calls, fn: async (env, q) => (calls.push(q), reply) };
}

test('another origin gets 403 and no model call', async () => {
  const g = spy();
  const res = await handle(req({ question: 'hi' }, { origin: 'https://evil.example' }), makeEnv(), { generate: g.fn, now: NOW });
  assert.equal(res.status, 403);
  assert.equal(g.calls.length, 0);
});

test('a missing Origin gets 403; localhost is allowed only in development', async () => {
  const noOrigin = new Request('https://x/', { method: 'POST', body: '{}' });
  assert.equal((await handle(noOrigin, makeEnv(), { generate: spy().fn, now: NOW })).status, 403);
  const local = () => req({ question: 'q' }, { origin: 'http://localhost:4321' });
  assert.equal((await handle(local(), makeEnv(), { generate: spy().fn, now: NOW })).status, 403);
  const env = { ...makeEnv(), ENVIRONMENT: 'development' };
  assert.equal((await handle(local(), env, { generate: spy().fn, now: NOW })).status, 200);
});

test('a question over 300 characters is rejected before any model call', async () => {
  const g = spy();
  const res = await handle(req({ question: 'x'.repeat(LIMITS.questionChars + 1) }), makeEnv(), { generate: g.fn, now: NOW });
  assert.equal(res.status, 400);
  assert.equal(g.calls.length, 0);
});

test('a third question from the same visitor on the same day gets the limit message and no model call', async () => {
  const env = makeEnv();
  const g = spy();
  for (let i = 0; i < 2; i++) assert.equal((await handle(req({ question: 'q' }), env, { generate: g.fn, now: NOW })).status, 200);
  const res = await handle(req({ question: 'q' }), env, { generate: g.fn, now: NOW });
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'visitor_limit');
  assert.equal(g.calls.length, 2);
  // a different visitor, and the same visitor tomorrow, are still served
  assert.equal((await handle(req({ question: 'q' }, { ip: '198.51.100.9' }), env, { generate: g.fn, now: NOW })).status, 200);
  const tomorrow = () => new Date('2026-11-25T00:00:01Z');
  assert.equal((await handle(req({ question: 'q' }), env, { generate: g.fn, now: tomorrow })).status, 200);
});

test('after 50 questions in a day the next gets "come back tomorrow" and the recorded session link', async () => {
  const env = makeEnv({ kv: { 'g:2026-11-24': '50' } });
  const g = spy();
  const res = await handle(req({ question: 'q' }), env, { generate: g.fn, now: NOW });
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.equal(body.error, 'daily_limit');
  assert.match(body.message, /tomorrow/i);
  assert.equal(body.recordedSession, RECORDED_SESSION);
  assert.equal(g.calls.length, 0);
});

test('the visitor key does not contain the IP address', async () => {
  const env = makeEnv();
  await handle(req({ question: 'q' }, { ip: '203.0.113.7' }), env, { generate: spy().fn, now: NOW });
  assert.ok([...env.store.keys()].every((k) => !k.includes('203.0.113.7')));
});

test('a request that reached the model counts even when the model fails', async () => {
  const env = makeEnv();
  const res = await handle(req({ question: 'q' }), env, { generate: async () => { throw new Error('down'); }, now: NOW });
  assert.equal(res.status, 502);
  assert.equal(env.store.get('g:2026-11-24'), '1');
});

test('bad SQL from the model never reaches D1', async () => {
  for (const sql of ['DROP TABLE ledger', 'SELECT 1 FROM ledger; DELETE FROM ledger', 'SELECT * FROM sqlite_master']) {
    const env = makeEnv();
    const res = await handle(req({ question: 'q' }), env, { generate: spy({ sql, explanation: '' }).fn, now: NOW });
    assert.equal(res.status, 422);
    assert.equal(env.ran.length, 0);
    const body = await res.json();
    assert.equal(body.sql, undefined);
  }
});

test('results are capped at 100 rows and LIMIT 100 is sent to D1', async () => {
  const rows = Array.from({ length: 250 }, (_, i) => ({ i }));
  const env = makeEnv({ rows });
  const res = await handle(req({ question: 'q' }), env, { generate: spy({ sql: 'SELECT * FROM ledger', explanation: 'x' }).fn, now: NOW });
  const body = await res.json();
  assert.equal(body.rows.length, 100);
  assert.equal(body.truncated, true);
  assert.match(env.ran[0], /LIMIT 100$/);
});

test('a declined question (sql null) runs nothing', async () => {
  const env = makeEnv();
  const res = await handle(req({ question: 'q' }), env, { generate: spy({ sql: null, explanation: 'Ambiguous.' }).fn, now: NOW });
  const body = await res.json();
  assert.equal(body.declined, true);
  assert.equal(env.ran.length, 0);
});

test('parseModelReply reads JSON inside prose and rejects junk', () => {
  assert.deepEqual(parseModelReply('Sure! {"sql": "SELECT 1", "explanation": "one"} done'), { sql: 'SELECT 1', explanation: 'one' });
  assert.equal(parseModelReply('no json here'), null);
  assert.equal(parseModelReply('{"sql": 5}'), null);
});

test('generate: Workers AI by default, Haiku when MODEL_PROVIDER says so, key only in the header', async () => {
  const seen = [];
  const env = { AI: { run: async (model, input) => (seen.push([model, input.max_tokens]), { response: '{"sql":"SELECT 1","explanation":"e"}' }) } };
  assert.equal((await generate(env, 'q')).sql, 'SELECT 1');
  assert.equal(seen[0][1], LIMITS.maxTokens);

  let call;
  const fetchFn = async (url, init) => {
    call = { url, init };
    return { ok: true, json: async () => ({ content: [{ text: '{"sql":null,"explanation":"e"}' }] }) };
  };
  const out = await generate({ MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-key-not-real' }, 'q', fetchFn);
  assert.equal(out.sql, null);
  assert.equal(call.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(JSON.parse(call.init.body).model, 'claude-haiku-5-5');
  assert.ok(!call.init.body.includes('test-key-not-real'));
});

// ---------- data files ----------
test('schema.sql and seed.sql match a fresh run', () => {
  assert.equal(readFileSync(join(here, 'schema.sql'), 'utf8'), SCHEMA_SQL);
  assert.equal(readFileSync(join(here, 'seed.sql'), 'utf8'), buildSeedSql());
});

test('seeded SQLite holds the 1,008 synthetic rows', () => {
  const db = openLedger();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ledger').get().n, 1008);
});

// ---------- scorer ----------
test('hand-written reference SQL for two questions is scored as correct, a wrong one is not', () => {
  const rows = buildLedger();
  const db = openLedger(rows);
  const q = (text) => QUESTIONS.find((x) => x.text === text);
  const good = judgeSql(db, rows, q('What was total revenue in 2025?'), "SELECT SUM(amount) FROM ledger WHERE account_group='Revenue' AND month LIKE '2025-%'");
  assert.equal(good.verdict, 'correct_answer');
  const bad = judgeSql(db, rows, q('What was total revenue in 2025?'), "SELECT SUM(amount) FROM ledger WHERE account_group='Revenue'");
  assert.equal(bad.verdict, 'wrong_answer');
  const top = judgeSql(db, rows, q('Which entity had the highest revenue in 2025?'), "SELECT entity, SUM(amount) r FROM ledger WHERE account_group='Revenue' AND month LIKE '2025-%' GROUP BY entity ORDER BY r DESC LIMIT 1");
  assert.equal(top.verdict, 'correct_answer');
  assert.equal(judgeSql(db, rows, q('What was EBITDA in 2025?'), null).verdict, 'correct_refusal');
  assert.equal(judgeSql(db, rows, q('What was total revenue in 2025?'), null).verdict, 'wrongly_refused');
  assert.equal(judgeSql(db, rows, q('What was total revenue in 2025?'), 'DROP TABLE ledger').verdict, 'rejected_sql');
  assert.equal(judgeSql(db, rows, q('What was EBITDA in 2025?'), 'SELECT 1 FROM ledger').verdict, 'wrong_answer');
});

test('matchesGold needs the right row count', () => {
  assert.equal(matchesGold([{ a: 1 }, { a: 2 }], { kind: 'scalar', value: 1 }), false);
  assert.equal(matchesGold([{ l: 'x', v: 1 }], { kind: 'table', rows: [{ label: 'x', value: 1 }, { label: 'y', value: 2 }] }), false);
});

test('scorecard: not_run without queries; model errors are not counted as refusals', () => {
  const none = buildScorecard(null);
  assert.equal(none.status, 'not_run');
  assert.equal(none.questions.length, 47);
  const scored = buildScorecard(QUESTIONS.map((q) => ({ id: q.id, sql: null, error: true })));
  assert.equal(scored.summary.model_error, 47);
  assert.equal(scored.summary.right, 0);
});

test('saved scorecard and recorded session match a fresh run', () => {
  const saved = JSON.parse(readFileSync(join(root, 'data/ledger-api/scorecard.json'), 'utf8'));
  if (saved.status === 'not_run') assert.deepEqual(saved, JSON.parse(JSON.stringify(buildScorecard(null))));
  else assert.equal(saved.summary.total, 47);
  const session = JSON.parse(readFileSync(join(root, 'data/ledger-api/recorded-session.json'), 'utf8'));
  assert.deepEqual(session, JSON.parse(JSON.stringify(buildSession())));
  for (const f of ['scorecard.json', 'recorded-session.json']) {
    assert.equal(readFileSync(join(root, 'data/ledger-api', f), 'utf8'), readFileSync(join(root, 'public/data/ledger-api', f), 'utf8'));
  }
});

test('a LIMIT above 100 is lowered to 100; a smaller one is kept', () => {
  assert.equal(validateSql('SELECT * FROM ledger LIMIT 1000').sql, 'SELECT * FROM ledger LIMIT 100');
  assert.equal(validateSql('SELECT * FROM ledger LIMIT 500 OFFSET 20').sql, 'SELECT * FROM ledger LIMIT 100 OFFSET 20');
  assert.equal(validateSql('SELECT * FROM ledger LIMIT 5').sql, 'SELECT * FROM ledger LIMIT 5');
});

test('a table after a subquery in the FROM list is still checked', () => {
  assert.equal(validateSql('SELECT * FROM (SELECT 1), secrets').ok, false);
});

test('parseModelReply accepts an already-parsed object', () => {
  assert.deepEqual(parseModelReply({ sql: 'SELECT 1', explanation: 'one' }), { sql: 'SELECT 1', explanation: 'one' });
  assert.deepEqual(parseModelReply({ sql: null, explanation: 'no' }), { sql: null, explanation: 'no' });
  assert.equal(parseModelReply({ sql: 5 }), null);
  assert.equal(parseModelReply(undefined), null);
});

test('parseModelReply reads JSON inside a code fence', () => {
  assert.deepEqual(parseModelReply('```json\n{"sql": "SELECT 1", "explanation": "x"}\n```'), { sql: 'SELECT 1', explanation: 'x' });
});
