import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSql } from '../../worker/ledger-api/src/validate.mjs';
import { handle, ALLOWED_ORIGIN } from '../../worker/ledger-api/src/index.mjs';
import { parseModelReply } from '../../worker/ledger-api/src/generate.mjs';
import { GLOBAL_PER_DAY, PER_VISITOR_PER_DAY, globalKey, utcDate } from '../../worker/ledger-api/src/limits.mjs';
import { buildOutputs } from './build.mjs';
import { QUESTIONS } from './questions.mjs';
import { openDb, buildScorecard, sameResult } from './score.mjs';

// ---- SQL validation ----
test('validator accepts plain selects and adds LIMIT 100', () => {
  const r = validateSql('SELECT COUNT(*) AS n FROM invoices;');
  assert.deepEqual(r, { ok: true, sql: 'SELECT COUNT(*) AS n FROM invoices LIMIT 100' });
  assert.equal(validateSql('SELECT * FROM vendors LIMIT 5').sql, 'SELECT * FROM vendors LIMIT 5');
  assert.ok(validateSql('WITH t AS (SELECT vendor_id FROM invoices) SELECT * FROM t JOIN vendors v ON v.vendor_id = t.vendor_id').ok);
});

test('validator rejects writes, second statements, other tables and tricks', () => {
  const bad = [
    'DROP TABLE invoices',
    'SELECT 1; DROP TABLE invoices',
    'SELECT * FROM invoices; SELECT * FROM vendors',
    'DELETE FROM invoices',
    'PRAGMA table_info(invoices)',
    'SELECT * FROM sqlite_master',
    'SELECT * FROM users',
    'SELECT * FROM invoices, secrets',
    'SELECT * FROM invoices JOIN secrets ON 1=1',
    'SELECT * FROM main.invoices',
    'SELECT * FROM "invoices"',
    'WITH x AS (DELETE FROM invoices) SELECT 1',
    'SELECT * FROM invoices /* unterminated',
    "SELECT * FROM invoices WHERE status = 'x",
    'EXPLAIN SELECT 1',
    '',
  ];
  for (const sql of bad) assert.equal(validateSql(sql).ok, false, sql);
});

test('keywords inside string literals are fine', () => {
  assert.ok(validateSql("SELECT * FROM vendors WHERE name = 'Drop; Table'").ok);
});

// ---- Worker flow, with fakes ----
function fakeKv() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) };
}
function fakeEnv(rows = [{ n: 3 }]) {
  const ran = [];
  return {
    ran,
    COUNTERS: fakeKv(),
    LEDGER: { prepare: (sql) => ({ all: async () => (ran.push(sql), { results: rows }) }) },
  };
}
const req = (body, { origin = ALLOWED_ORIGIN, ip = '203.0.113.7' } = {}) =>
  new Request('https://ledger-api.example/ask', { method: 'POST', headers: { origin, 'cf-connecting-ip': ip, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const modelOk = (calls) => async () => (calls.n++, { sql: 'SELECT COUNT(*) AS n FROM invoices', explanation: 'Counts invoices.' });

test('wrong origin gets 403 and no model call', async () => {
  const env = fakeEnv();
  const calls = { n: 0 };
  const res = await handle(req({ question: 'hi' }, { origin: 'https://evil.example' }), env, { generate: modelOk(calls) });
  assert.equal(res.status, 403);
  assert.equal(calls.n, 0);
  assert.equal((await handle(new Request('https://x/', { method: 'POST', body: '{}' }), env, { generate: modelOk(calls) })).status, 403);
});

test('question over 300 characters is rejected before any model call', async () => {
  const env = fakeEnv();
  const calls = { n: 0 };
  const res = await handle(req({ question: 'x'.repeat(301) }), env, { generate: modelOk(calls) });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).reason, 'too_long');
  assert.equal(calls.n, 0);
  assert.equal(env.COUNTERS.m.size, 0);
});

test('third question from one visitor gets the limit message and no model call', async () => {
  const env = fakeEnv();
  const calls = { n: 0 };
  for (let i = 0; i < PER_VISITOR_PER_DAY; i++) assert.equal((await handle(req({ question: 'How many invoices?' }), env, { generate: modelOk(calls) })).status, 200);
  const res = await handle(req({ question: 'How many invoices?' }), env, { generate: modelOk(calls) });
  assert.equal(res.status, 429);
  assert.equal((await res.json()).reason, 'visitor_limit');
  assert.equal(calls.n, PER_VISITOR_PER_DAY);
  // another visitor is still served
  assert.equal((await handle(req({ question: 'How many invoices?' }, { ip: '198.51.100.9' }), env, { generate: modelOk(calls) })).status, 200);
});

test('after 50 questions in a day the next gets come-back-tomorrow with the recorded session link', async () => {
  const env = fakeEnv();
  env.COUNTERS.m.set(globalKey(utcDate()), String(GLOBAL_PER_DAY));
  const calls = { n: 0 };
  const res = await handle(req({ question: 'How many invoices?' }), env, { generate: modelOk(calls) });
  const body = await res.json();
  assert.equal(res.status, 429);
  assert.equal(body.reason, 'daily_limit');
  assert.match(body.message, /tomorrow/);
  assert.match(body.recordedSession, /recorded-session/);
  assert.equal(calls.n, 0);
});

test('a model that fails still counts; a DROP never reaches D1', async () => {
  const env = fakeEnv();
  const boom = async () => { throw new Error('down'); };
  assert.equal((await handle(req({ question: 'q' }), env, { generate: boom })).status, 502);
  assert.equal(env.COUNTERS.m.get(globalKey(utcDate())), '1');
  const drop = async () => ({ sql: 'DROP TABLE invoices', explanation: '' });
  const res = await handle(req({ question: 'q' }), env, { generate: drop });
  assert.equal((await res.json()).reason, 'rejected_sql');
  const two = async () => ({ sql: 'SELECT 1; SELECT 2', explanation: '' });
  const other = await handle(req({ question: 'q' }, { ip: '198.51.100.1' }), env, { generate: two });
  assert.equal((await other.json()).reason, 'rejected_sql');
  assert.equal(env.ran.length, 0);
});

test('results are capped at 100 rows and LIMIT 100 is appended', async () => {
  const many = Array.from({ length: 250 }, (_, i) => ({ id: i }));
  const env = fakeEnv(many);
  const gen = async () => ({ sql: 'SELECT invoice_id AS id FROM invoices', explanation: 'All.' });
  const body = await (await handle(req({ question: 'q' }), env, { generate: gen })).json();
  assert.equal(body.rows.length, 100);
  assert.match(env.ran[0], /LIMIT 100$/);
});

test('model reply parsing tolerates fences and rejects junk', () => {
  assert.deepEqual(parseModelReply('```json\n{"sql":"SELECT 1","explanation":"x"}\n```'), { sql: 'SELECT 1', explanation: 'x' });
  assert.equal(parseModelReply('no json here'), null);
  assert.equal(parseModelReply('{"explanation":"no sql"}'), null);
});

// ---- Data, scorecard, saved outputs ----
test('every reference query passes the validator and returns rows', () => {
  const db = openDb();
  for (const q of QUESTIONS) {
    assert.equal(validateSql(q.sql).ok, true, `q${q.id} validates`);
    assert.ok(db.prepare(q.sql).all().length > 0, `q${q.id} returns rows`);
  }
});

test('scorecard marks right, wrong, rejected and not-run correctly', () => {
  const db = openDb();
  const card = buildScorecard(db, { 1: QUESTIONS[0].sql, 2: 'SELECT 1', 3: 'DROP TABLE invoices' });
  const v = Object.fromEntries(card.questions.map((q) => [q.id, q.verdict]));
  assert.deepEqual([v[1], v[2], v[3], v[4]], ['right', 'wrong', 'rejected', 'not_run']);
  assert.equal(card.ran, 3);
  assert.equal(card.right, 1);
  assert.ok(Math.abs(card.accuracy - 1 / 3) < 1e-9);
  assert.equal(sameResult([{ a: 1.001 }], [{ b: 1 }]), true);
});

test('saved SQL, scorecard and recorded session match a fresh build', () => {
  const out = buildOutputs({});
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  assert.equal(read('worker/ledger-api/sql/schema.sql'), out.schema);
  assert.equal(read('worker/ledger-api/sql/seed.sql'), out.seed);
  for (const dir of ['data/ledger-api', 'public/data/ledger-api']) {
    assert.deepEqual(JSON.parse(read(`${dir}/scorecard.json`)), JSON.parse(JSON.stringify(out.scorecard)));
    assert.deepEqual(JSON.parse(read(`${dir}/recorded.json`)), JSON.parse(JSON.stringify(out.recorded)));
  }
});
