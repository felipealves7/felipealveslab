import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { summarise, comparePriorities, wilson, rankDescending, assertAggregateOnly, ACTIVITIES, MIN_CELL, NO_PROJECT } from './aggregate.mjs';
import { config, localDay, scheduleDay, sign, sameString, validateAnswer, planDay, sendDue, handle, LATE_MINUTES } from './worker.mjs';
import { buildResults } from './run.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

// A small stand-in for Cloudflare D1 over node:sqlite, so the Worker's SQL runs for real in tests.
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())), raw: db };
}

const ENV = (db) => ({ DB: db, PING_SECRET: 'test-secret', NTFY_TOPIC: 'test-topic', EXPORT_TOKEN: 'export-token', BASE_URL: 'https://w.example', PROJECTS: 'Alpha, Beta,Gamma' });
const seq = (values) => { let i = 0; return () => values[i++ % values.length]; };
const ok = () => Promise.resolve({ ok: true });

// ---------- aggregation ----------

const answer = (over = {}) => ({ day: '2026-12-01', scheduled_at: '2026-12-01T06:00:00.000Z', send_status: 'sent', sent_at: '2026-12-01T06:00:00.000Z', answered_at: '2026-12-01T06:05:00.000Z', activity: 'Focused work', on_task: 1, time_focus: 'present', project: 'Alpha', mood: 60, ...over });

test('Wilson interval matches the textbook value and handles the edges', () => {
  const [lo, hi] = wilson(5, 10);
  assert.ok(Math.abs(lo - 0.2366) < 0.0005 && Math.abs(hi - 0.7634) < 0.0005);
  assert.equal(wilson(0, 0), null);
  assert.equal(wilson(0, 10)[0], 0);
  assert.equal(wilson(10, 10)[1], 1);
});

test('counts sent, answered, missed and not sent separately', () => {
  const rows = [
    answer(),
    answer({ answered_at: null, activity: null, on_task: null, time_focus: null, project: null, mood: null }),
    answer({ send_status: 'failed', sent_at: null, answered_at: null }),
    answer({ send_status: 'skipped', sent_at: null, answered_at: null }),
    answer({ send_status: 'pending', sent_at: null, answered_at: null }),
  ];
  const s = summarise(rows, { projects: ['Alpha'] });
  assert.deepEqual(s.pings, { scheduled: 5, sent: 2, sendFailed: 1, notSent: 2, answered: 1, missed: 1, answerRate: 0.5, days: 1 });
});

test('off-task share and project shares use answered pings as the denominator', () => {
  const rows = [answer(), answer({ on_task: 0, project: 'Beta' }), answer({ on_task: 0, project: NO_PROJECT }), answer({ answered_at: null })];
  const s = summarise(rows, { projects: ['Alpha', 'Beta'] });
  assert.equal(s.offTask.count, 2);
  assert.equal(s.offTask.of, 3);
  assert.deepEqual(s.projects.map((p) => [p.name, p.count, p.of]), [['Alpha', 1, 3], ['Beta', 1, 3], [NO_PROJECT, 1, 3]]);
  assert.equal(s.activities.length, ACTIVITIES.length);
});

test('mood averages are withheld for groups smaller than the minimum cell', () => {
  const rows = Array.from({ length: MIN_CELL }, (_, i) => answer({ mood: 50 + i })).concat([answer({ on_task: 0, mood: 10 })]);
  const s = summarise(rows, { projects: ['Alpha'] });
  assert.equal(s.mood.onTask.suppressed, false);
  assert.equal(s.mood.onTask.mean, 52);
  assert.deepEqual(s.mood.offTask, { n: 1, mean: null, suppressed: true });
});

test('response pattern is grouped by local three-hour block', () => {
  // 06:00 UTC is 10:00 at UTC+4
  const s = summarise([answer(), answer({ sent_at: '2026-12-01T14:30:00.000Z', answered_at: null })], { projects: ['Alpha'], offsetMinutes: 240 });
  assert.deepEqual(s.responseByBlock, [{ block: '09–12', sent: 1, answered: 1 }, { block: '18–21', sent: 1, answered: 0 }]);
});

test('an answer outside the offered categories stops the build', () => {
  assert.throws(() => summarise([answer({ project: 'Delta' })], { projects: ['Alpha'] }), /not on the list/);
  assert.throws(() => summarise([answer({ activity: 'Napping' })], { projects: ['Alpha'] }), /unknown activity/);
});

test('ranks put the largest first and share ties', () => {
  assert.deepEqual(rankDescending([3, 9, 3, 1]), [2.5, 1, 2.5, 4]);
});

test('compares stated priority rank with reported share, in stated order', () => {
  const rows = [answer({ project: 'Beta' }), answer({ project: 'Beta' }), answer({ project: 'Alpha' })];
  const s = summarise(rows, { projects: ['Alpha', 'Beta'] });
  const c = comparePriorities(s, { writtenAt: '2026-11-30', projects: [{ name: 'Beta', rank: 2 }, { name: 'Alpha', rank: 1 }] });
  assert.deepEqual(c.map((r) => [r.name, r.statedRank, r.count, r.reportedRank]), [['Alpha', 1, 1, 2], ['Beta', 2, 2, 1]]);
  assert.equal(comparePriorities(s, null), null);
  assert.throws(() => comparePriorities(s, { projects: [{ name: 'Zeta', rank: 1 }] }), /not a project/);
});

test('the published file refuses row-level fields', () => {
  assert.throws(() => assertAggregateOnly({ a: [{ answered_at: 'x' }] }), /row-level field "answered_at"/);
  const out = buildResults({ summary: summarise([answer()], { projects: ['Alpha'] }) }, { writtenAt: '2026-11-30', projects: [{ name: 'Alpha', rank: 1 }] }, '2026-12-23');
  assert.equal(out.comparison[0].count, 1);
});

// ---------- scheduling ----------

const CFG = config({ PROJECTS: 'Alpha,Beta' });

test('local day follows the configured offset', () => {
  assert.equal(localDay(Date.parse('2026-11-30T21:00:00Z'), 240), '2026-12-01');
  assert.equal(localDay(Date.parse('2026-11-30T19:59:00Z'), 240), '2026-11-30');
});

test('a day has six pings inside 09:00 to 21:00 local, at least 60 minutes apart', () => {
  for (let seed = 1; seed <= 50; seed++) {
    let x = seed;
    const rand = () => ((x = (x * 48271) % 2147483647) / 2147483647);
    const times = scheduleDay('2026-12-05', CFG, rand).map((t) => Date.parse(t));
    assert.equal(times.length, 6);
    for (const t of times) {
      const h = new Date(t + 240 * 60000).getUTCHours();
      assert.ok(h >= 9 && h < 21, `hour ${h}`);
    }
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 60 * 60000);
  }
});

test('an impossible schedule is refused', () => {
  assert.throws(() => scheduleDay('2026-12-05', { ...CFG, perDay: 20 }), /too short/);
});

// ---------- links and form ----------

test('signatures depend on the secret and compare safely', async () => {
  const a = await sign('0123456789abcdef', 's1');
  assert.equal(a.length, 32);
  assert.notEqual(a, await sign('0123456789abcdef', 's2'));
  assert.ok(sameString(a, a));
  assert.ok(!sameString(a, 'f'.repeat(32)) && !sameString(a, a.slice(0, 31)));
  await assert.rejects(sign('x', ''), /PING_SECRET/);
});

test('the form accepts only offered categories and a whole mood from 0 to 100', () => {
  const good = { activity: 'Focused work', on_task: '0', time_focus: 'future', project: 'Beta', mood: '100' };
  assert.deepEqual(validateAnswer(good, ['Alpha', 'Beta']), { ok: true, value: { activity: 'Focused work', on_task: 0, time_focus: 'future', project: 'Beta', mood: 100 } });
  assert.equal(validateAnswer({ ...good, project: NO_PROJECT }, ['Alpha']).ok, true);
  for (const bad of [{ activity: 'x' }, { on_task: 'yes' }, { time_focus: 'now' }, { project: 'Gamma' }, { mood: '101' }, { mood: '5.5' }, { mood: '' }]) {
    assert.equal(validateAnswer({ ...good, ...bad }, ['Alpha', 'Beta']).ok, false, JSON.stringify(bad));
  }
});

// ---------- Worker end to end on a fake D1 ----------

test('plans a day once, only inside the collection dates', async () => {
  const db = fakeD1();
  const env = ENV(db);
  const cfg = config(env);
  assert.equal(await planDay(env, cfg, Date.parse('2026-11-30T10:00:00Z')), 0);
  assert.equal(await planDay(env, cfg, Date.parse('2026-12-01T02:00:00Z')), 6);
  assert.equal(await planDay(env, cfg, Date.parse('2026-12-01T03:00:00Z')), 0);
  assert.equal(await planDay(env, cfg, Date.parse('2026-12-23T03:00:00Z')), 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM pings').get().n, 6);
});

test('sends due pings with a signed link, skips late ones and records failures', async () => {
  const db = fakeD1();
  const env = ENV(db);
  const cfg = config(env);
  const insert = db.raw.prepare('INSERT INTO pings (id, day, scheduled_at) VALUES (?, ?, ?)');
  insert.run('aaaaaaaaaaaaaaaa', '2026-12-01', '2026-12-01T06:00:00.000Z');
  insert.run('bbbbbbbbbbbbbbbb', '2026-12-01', '2026-12-01T05:00:00.000Z');
  insert.run('cccccccccccccccc', '2026-12-01', '2026-12-01T06:02:00.000Z');
  insert.run('dddddddddddddddd', '2026-12-01', '2026-12-01T09:00:00.000Z');
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url, init }); return { ok: !init.headers.Click.includes('cccc') }; };
  const out = await sendDue(env, cfg, Date.parse('2026-12-01T06:05:00Z'), fetcher);
  assert.deepEqual(out, { sent: 1, failed: 1, skipped: 1 });
  assert.equal(calls[0].url, 'https://ntfy.sh/test-topic');
  assert.equal(calls[0].init.headers.Click, `https://w.example/p/aaaaaaaaaaaaaaaa?s=${await sign('aaaaaaaaaaaaaaaa', 'test-secret')}`);
  const status = Object.fromEntries(db.raw.prepare('SELECT id, send_status FROM pings').all().map((r) => [r.id[0], r.send_status]));
  assert.deepEqual(status, { a: 'sent', b: 'skipped', c: 'failed', d: 'pending' });
  assert.ok(LATE_MINUTES < 60);
});

async function sentPing(db) {
  db.raw.prepare("INSERT INTO pings (id, day, scheduled_at, send_status, sent_at) VALUES ('aaaaaaaaaaaaaaaa', '2026-12-01', '2026-12-01T06:00:00.000Z', 'sent', '2026-12-01T06:00:00.000Z')").run();
  return `https://w.example/p/aaaaaaaaaaaaaaaa?s=${await sign('aaaaaaaaaaaaaaaa', 'test-secret')}`;
}
const post = (url, fields) => new Request(url, { method: 'POST', body: new URLSearchParams(fields) });
const FIELDS = { activity: 'Reading and learning', on_task: '1', time_focus: 'present', project: 'Gamma', mood: '72' };

test('a signed link opens the form; a wrong signature does not', async () => {
  const db = fakeD1();
  const env = ENV(db);
  const link = await sentPing(db);
  const now = Date.parse('2026-12-01T06:10:00Z');
  const res = await handle(new Request(link), env, now);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Gamma/);
  assert.match(html, new RegExp(NO_PROJECT));
  assert.ok(!/<textarea|type="text"/.test(html), 'no free-text field');
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal((await handle(new Request(`${link.split('?s=')[0]}?s=${'0'.repeat(32)}`), env, now)).status, 404);
});

test('an answer is saved once, and not after the ping expires', async () => {
  const db = fakeD1();
  const env = ENV(db);
  const link = await sentPing(db);
  assert.equal((await handle(post(link, { ...FIELDS, mood: '300' }), env, Date.parse('2026-12-01T06:10:00Z'))).status, 400);
  assert.equal((await handle(post(link, FIELDS), env, Date.parse('2026-12-01T06:10:00Z'))).status, 200);
  assert.equal((await handle(post(link, FIELDS), env, Date.parse('2026-12-01T06:11:00Z'))).status, 409);
  const row = db.raw.prepare('SELECT activity, on_task, project, mood FROM pings').get();
  assert.deepEqual({ ...row }, { activity: 'Reading and learning', on_task: 1, project: 'Gamma', mood: 72 });

  const db2 = fakeD1();
  const link2 = await sentPing(db2);
  assert.equal((await handle(post(link2, FIELDS), ENV(db2), Date.parse('2026-12-01T06:31:00Z'))).status, 410);
});

test('/aggregates needs the token and returns counts, not rows', async () => {
  const db = fakeD1();
  const env = ENV(db);
  const link = await sentPing(db);
  await handle(post(link, FIELDS), env, Date.parse('2026-12-01T06:10:00Z'));
  assert.equal((await handle(new Request('https://w.example/aggregates'), env)).status, 404);
  assert.equal((await handle(new Request('https://w.example/aggregates', { headers: { authorization: 'Bearer nope' } }), env)).status, 404);
  const res = await handle(new Request('https://w.example/aggregates', { headers: { authorization: 'Bearer export-token' } }), env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assertAggregateOnly(body);
  assert.equal(body.summary.pings.answered, 1);
  assert.equal(body.summary.projects.find((p) => p.name === 'Gamma').count, 1);
  assert.ok(!JSON.stringify(body).includes('aaaaaaaaaaaaaaaa'));
});

// ---------- the saved file ----------

test('the saved results file is aggregate-only and matches the collection dates', () => {
  const saved = JSON.parse(readFileSync(join(root, 'data/attention/results.json'), 'utf8'));
  assertAggregateOnly(saved);
  assert.deepEqual(saved.collection, { start: '2026-12-01', end: '2026-12-22' });
  const p = saved.summary.pings;
  assert.equal(p.answered + p.missed, p.sent);
});
