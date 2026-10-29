import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { validateSql } from './validate.mjs';
import { parseModelOutput } from './generate.mjs';
import { handle, SITE_ORIGIN } from './worker.mjs';
import { schemaFile, seedFile } from './schema.mjs';
import { scoreGenerated, scorecardQuestions, openLedger, matches } from './scorecard.mjs';
import { recordedSession, notRunScorecard } from './build-data.mjs';

// ---------- validation ----------
test('accepts a plain SELECT and appends LIMIT 100', () => {
  assert.deepEqual(validateSql('SELECT entity FROM ledger;'), { ok: true, sql: 'SELECT entity FROM ledger LIMIT 100' });
  assert.equal(validateSql('select 1 from ledger limit 5').sql, 'select 1 from ledger limit 5');
});

test('accepts WITH, subqueries, joins on the schema and aliases', () => {
  assert.ok(validateSql('WITH r AS (SELECT entity, SUM(amount) a FROM ledger GROUP BY entity) SELECT * FROM r').ok);
  assert.ok(validateSql('SELECT a.entity FROM ledger a JOIN ledger b ON a.entity = b.entity').ok);
  assert.ok(validateSql('SELECT * FROM (SELECT entity FROM ledger) t').ok);
  assert.ok(validateSql("SELECT 'drop; table' AS note FROM ledger").ok, 'banned words inside a string literal are fine');
});

test('rejects non-reads, second statements, outside tables and tricks', () => {
  const bad = [
    'DROP TABLE ledger',
    'SELECT 1; DROP TABLE ledger',
    'SELECT 1 FROM ledger; SELECT 2 FROM ledger',
    'INSERT INTO ledger VALUES (1)',
    'DELETE FROM ledger',
    'UPDATE ledger SET amount = 0',
    'PRAGMA table_info(ledger)',
    'ATTACH DATABASE "x" AS y',
    'SELECT replace(entity, "a", "b") FROM ledger',
    'SELECT * FROM users',
    'SELECT * FROM ledger, users',
    'SELECT * FROM ledger JOIN secrets ON 1=1',
    'SELECT * FROM sqlite_master',
    'SELECT * FROM main.ledger',
    'SELECT * FROM ledger -- hi',
    'SELECT /* x */ 1 FROM ledger',
    'EXPLAIN SELECT 1',
    '',
    null,
  ];
  for (const sql of bad) assert.equal(validateSql(sql).ok, false, `should reject: ${sql}`);
});

// ---------- worker ----------
const seedDb = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaFile());
  db.exec(seedFile());
  return db;
};

function makeEnv(modelReply, extra = {}) {
  const store = new Map();
  const db = seedDb();
  const env = {
    calls: 0,
    COUNTERS: { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) },
    LEDGER: { prepare: (sql) => ({ all: async () => ({ results: db.prepare(sql).all().map((r) => ({ ...r })) }) }) },
    AI: {
      run: async () => {
        env.calls += 1;
        if (modelReply instanceof Error) throw modelReply;
        return { response: typeof modelReply === 'string' ? modelReply : JSON.stringify(modelReply) };
      },
    },
    ...extra,
  };
  env.store = store;
  return env;
}

const ask = (env, question, { origin = SITE_ORIGIN, ip = '1.2.3.4', now } = {}) =>
  handle(new Request('https://ledger-api.example/ask', { method: 'POST', headers: { origin, 'cf-connecting-ip': ip, 'content-type': 'application/json' }, body: JSON.stringify({ question }) }), env, now);

const GOOD = { sql: "SELECT SUM(amount) AS revenue FROM ledger WHERE grp = 'Revenue'", explanation: 'Adds all revenue.' };

test('happy path returns query, rows and explanation, and counts once', async () => {
  const env = makeEnv(GOOD);
  const res = await ask(env, 'Total revenue?');
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.match(body.sql, /LIMIT 100$/);
  assert.equal(body.rows.length, 1);
  assert.equal(body.explanation, 'Adds all revenue.');
  assert.equal(res.headers.get('access-control-allow-origin'), SITE_ORIGIN);
  assert.equal(env.calls, 1);
  assert.equal([...env.store.values()].filter((v) => v === '1').length, 2);
});

test('a third question from the same visitor on the same day gets the limit message and no model call', async () => {
  const env = makeEnv(GOOD);
  await ask(env, 'one');
  await ask(env, 'two');
  const res = await ask(env, 'three');
  const body = await res.json();
  assert.equal(res.status, 429);
  assert.equal(body.code, 'visitor_limit');
  assert.equal(body.recorded, true);
  assert.equal(env.calls, 2);
  const other = await ask(env, 'four', { ip: '9.9.9.9' });
  assert.equal(other.status, 200, 'another visitor is not blocked');
});

test('the visitor count resets on the next UTC day', async () => {
  const env = makeEnv(GOOD);
  await ask(env, 'a', { now: new Date('2026-11-01T23:00:00Z') });
  await ask(env, 'b', { now: new Date('2026-11-01T23:30:00Z') });
  const res = await ask(env, 'c', { now: new Date('2026-11-02T00:10:00Z') });
  assert.equal(res.status, 200);
});

test('after 50 questions in a day the next gets "come back tomorrow" and the recorded session link', async () => {
  const env = makeEnv(GOOD);
  for (let i = 0; i < 50; i++) {
    const r = await ask(env, 'q', { ip: `10.0.0.${i}` });
    assert.equal(r.status, 200, `question ${i + 1}`);
  }
  const res = await ask(env, 'q', { ip: '10.0.1.1' });
  const body = await res.json();
  assert.equal(res.status, 429);
  assert.equal(body.code, 'daily_limit');
  assert.match(body.message, /tomorrow/i);
  assert.match(body.recordedUrl, /recorded-session$/);
  assert.equal(env.calls, 50);
});

test('a question over 300 characters is rejected before any model call', async () => {
  const env = makeEnv(GOOD);
  const res = await ask(env, 'x'.repeat(301));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'too_long');
  assert.equal(env.calls, 0);
  assert.equal(env.store.size, 0);
  assert.equal((await ask(env, 'x'.repeat(300))).status, 200);
});

test('another origin, or none, gets 403 and nothing runs', async () => {
  const env = makeEnv(GOOD);
  assert.equal((await ask(env, 'q', { origin: 'https://evil.example' })).status, 403);
  const none = await handle(new Request('https://ledger-api.example/ask', { method: 'POST', body: '{"question":"q"}' }), env);
  assert.equal(none.status, 403);
  assert.equal((await ask(env, 'q', { origin: 'http://localhost:8080' })).status, 403, 'localhost is off unless ALLOW_LOCALHOST=1');
  assert.equal((await ask(makeEnv(GOOD, { ALLOW_LOCALHOST: '1' }), 'q', { origin: 'http://localhost:8080' })).status, 200);
  assert.equal(env.calls, 0);
});

test('unsafe SQL from the model never reaches D1', async () => {
  for (const sql of ['DROP TABLE ledger', 'SELECT 1; DELETE FROM ledger', 'SELECT * FROM secrets']) {
    const env = makeEnv({ sql, explanation: 'x' });
    let reached = false;
    const prepare = env.LEDGER.prepare;
    env.LEDGER.prepare = (s) => { reached = true; return prepare(s); };
    const res = await ask(env, 'q');
    const body = await res.json();
    assert.equal(res.status, 422, sql);
    assert.equal(body.code, 'query_rejected');
    assert.equal(body.sql, undefined, 'the rejected query is not returned');
    assert.equal(reached, false, sql);
    assert.equal(env.calls, 1);
    assert.equal(env.store.size, 2, 'a request that reached the model still counts');
  }
});

test('results are capped at 100 rows', async () => {
  const env = makeEnv({ sql: 'SELECT * FROM ledger', explanation: 'All rows.' });
  const body = await (await ask(env, 'everything')).json();
  assert.equal(body.rows.length, 100);
  assert.match(body.sql, /LIMIT 100$/);
  // even if D1 ignored the LIMIT, the Worker trims
  const env2 = makeEnv({ sql: 'SELECT * FROM ledger', explanation: '' });
  env2.LEDGER.prepare = () => ({ all: async () => ({ results: Array.from({ length: 500 }, (_, i) => ({ i })) }) });
  assert.equal((await (await ask(env2, 'x')).json()).rows.length, 100);
});

test('a failing or unreadable model gives a friendly message, still counts, and points to the recorded session', async () => {
  const down = makeEnv(new Error('boom'));
  const r1 = await ask(down, 'q');
  assert.equal(r1.status, 502);
  assert.equal((await r1.json()).recorded, true);
  assert.equal(down.store.size, 2);
  const junk = makeEnv('I am not JSON');
  assert.equal((await (await ask(junk, 'q')).json()).code, 'bad_model_output');
});

test('a model that declines returns its explanation and no query', async () => {
  const env = makeEnv({ sql: null, explanation: '"Profit" could mean gross or operating profit.' });
  const body = await (await ask(env, 'What was profit?')).json();
  assert.equal(body.declined, true);
  assert.equal(body.sql, null);
});

test('model output is parsed from JSON wrapped in text, and bad output is null', () => {
  assert.deepEqual(parseModelOutput('Sure! {"sql":"SELECT 1 FROM ledger","explanation":"e"} done'), { sql: 'SELECT 1 FROM ledger', explanation: 'e' });
  assert.equal(parseModelOutput('nothing'), null);
  assert.equal(parseModelOutput('{bad json}'), null);
});

// ---------- data files and scorecard ----------
test('seed.sql and schema.sql in data/ are current', () => {
  const root = new URL('../../data/ask-the-ledger/', import.meta.url);
  assert.equal(readFileSync(new URL('schema.sql', root), 'utf8'), schemaFile());
  assert.equal(readFileSync(new URL('seed.sql', root), 'utf8'), seedFile());
  const db = seedDb();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ledger').get().n, 1008);
});

test('saved recorded session and the not-run scorecard match a fresh build, and the public copies match', () => {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  const rec = JSON.stringify(recordedSession(), null, 2) + '\n';
  assert.equal(read('data/ask-the-ledger/recorded-session.json'), rec);
  assert.equal(read('public/data/ask-the-ledger/recorded-session.json'), rec);
  assert.equal(read('data/ask-the-ledger/scorecard.json'), read('public/data/ask-the-ledger/scorecard.json'));
  const saved = JSON.parse(read('data/ask-the-ledger/scorecard.json'));
  if (saved.run === 0) assert.deepEqual(saved, { synthetic: true, ...notRunScorecard() });
});

test('scorecard: reference queries score correct, wrong figures and wrong declines do not', () => {
  const qs = scorecardQuestions();
  assert.equal(qs.length, 15);
  const sqlFor = {
    1: "SELECT SUM(amount) FROM ledger WHERE grp = 'Revenue' AND month LIKE '2025-%'",
    2: "SELECT SUM(amount) AS r FROM ledger WHERE grp = 'Revenue' AND month BETWEEN '2026-01' AND '2026-03'",
    3: "SELECT SUM(CASE WHEN grp='Revenue' THEN amount ELSE -amount END) FROM ledger WHERE grp IN ('Revenue','Cost of sales') AND month BETWEEN '2025-10' AND '2025-12'",
  };
  const generated = [
    ...Object.entries(sqlFor).map(([id, sql]) => ({ id: Number(id), sql })),
    { id: 4, sql: "SELECT 1.0 * SUM(amount) FROM ledger" }, // wrong figure
    { id: 5, sql: null }, // wrongly declined
    { id: 13, sql: null }, // right decline
    { id: 14, sql: 'SELECT 1 FROM ledger' }, // should have declined
    { id: 15, sql: 'DROP TABLE ledger' }, // rejected
  ];
  const card = scoreGenerated(generated);
  const by = Object.fromEntries(card.entries.map((e) => [e.id, e.status]));
  assert.deepEqual([by[1], by[2], by[3], by[4], by[5], by[13], by[14], by[15], by[6]], ['correct', 'correct', 'correct', 'wrong', 'wrong', 'correct', 'wrong', 'wrong', 'not_run']);
  assert.equal(card.run, 8);
  assert.equal(card.correct, 4);
  assert.equal(card.accuracy, 50);
  // the same question with the year filter left out is a wrong figure
  const unfiltered = scoreGenerated([{ id: 1, sql: "SELECT SUM(amount) FROM ledger WHERE grp = 'Revenue'" }]);
  assert.equal(unfiltered.entries[0].status, 'wrong');
});

test('table matching needs the same labels and values', () => {
  const exp = { kind: 'table', rows: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] };
  assert.ok(matches([{ e: 'B', v: 2 }, { e: 'A', v: 1 }], exp));
  assert.ok(!matches([{ e: 'A', v: 1 }, { e: 'B', v: 3 }], exp));
  assert.ok(!matches([{ e: 'A', v: 1 }], exp));
});

test('the recorded session examples run on the seeded ledger', () => {
  const s = recordedSession();
  assert.equal(s.steps.length, 2);
  assert.ok(s.steps.every((x) => x.rows.length > 0));
  assert.ok(openLedger());
});
