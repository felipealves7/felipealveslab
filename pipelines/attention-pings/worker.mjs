// Cloudflare Worker `attention-pings`: experience sampling for /lab/where-does-my-attention-go.
// Every 5 minutes (cron) it plans the day's random ping times and sends the ones that are due to
// ntfy.sh, with a signed link to a one-screen form. The form takes categories and a 0 to 100 mood
// score, never free text. GET /aggregates returns counts only, so raw answers never leave D1.
// Bindings: DB (D1). Secrets: PING_SECRET, NTFY_TOPIC, EXPORT_TOKEN, optional NTFY_TOKEN.

import { ACTIVITIES, TIME_FOCUS, NO_PROJECT, summarise } from './aggregate.mjs';

export const NTFY_SERVER = 'https://ntfy.sh';
export const LATE_MINUTES = 15; // a ping the cron could not send within this long of its time is skipped, not sent late

export function config(env) {
  const num = (k, d) => (env[k] === undefined || env[k] === '' ? d : Number(env[k]));
  return {
    baseUrl: String(env.BASE_URL ?? '').replace(/\/$/, ''),
    startDate: env.START_DATE ?? '2026-12-01',
    endDate: env.END_DATE ?? '2026-12-22',
    offsetMinutes: num('TZ_OFFSET_MINUTES', 240),
    windowStart: num('WINDOW_START_HOUR', 9),
    windowEnd: num('WINDOW_END_HOUR', 21),
    perDay: num('PINGS_PER_DAY', 6),
    minGap: num('MIN_GAP_MINUTES', 60),
    expireMinutes: num('EXPIRE_MINUTES', 30),
    projects: String(env.PROJECTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

/** Local calendar date (YYYY-MM-DD) for a UTC instant. */
export function localDay(nowMs, offsetMinutes) {
  return new Date(nowMs + offsetMinutes * 60000).toISOString().slice(0, 10);
}

/**
 * Random ping times for one local day: `perDay` minutes drawn uniformly inside the waking window,
 * redrawn until every pair is at least `minGap` minutes apart. Returns sorted UTC ISO strings.
 */
export function scheduleDay(day, cfg, rand = Math.random) {
  const span = (cfg.windowEnd - cfg.windowStart) * 60;
  if ((cfg.perDay - 1) * cfg.minGap >= span) throw new Error('the window is too short for that many pings at that gap');
  for (let attempt = 0; attempt < 10000; attempt++) {
    const minutes = Array.from({ length: cfg.perDay }, () => Math.floor(rand() * span)).sort((a, b) => a - b);
    if (minutes.every((m, i) => i === 0 || m - minutes[i - 1] >= cfg.minGap)) {
      const midnightUtc = Date.parse(`${day}T00:00:00Z`) - cfg.offsetMinutes * 60000;
      return minutes.map((m) => new Date(midnightUtc + (cfg.windowStart * 60 + m) * 60000).toISOString());
    }
  }
  throw new Error('could not draw a schedule');
}

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function randomId() {
  return hex(crypto.getRandomValues(new Uint8Array(8)));
}

export const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

/** HMAC-SHA256 of the ping id, first 32 hex characters. */
export async function sign(id, secret) {
  if (!secret) throw new Error('PING_SECRET is not set');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id))).slice(0, 32);
}

/** Length-safe comparison that does not stop at the first differing character. */
export function sameString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Checks a submitted form. Returns { ok: true, value } or { ok: false, error }. */
export function validateAnswer(form, projects) {
  const get = (k) => (typeof form.get === 'function' ? form.get(k) : form[k]);
  const activity = get('activity');
  const onTask = get('on_task');
  const timeFocus = get('time_focus');
  const project = get('project');
  const moodRaw = get('mood');
  if (!ACTIVITIES.includes(activity)) return { ok: false, error: 'Choose an activity.' };
  if (onTask !== '1' && onTask !== '0') return { ok: false, error: 'Say whether your mind was on it.' };
  if (!TIME_FOCUS.includes(timeFocus)) return { ok: false, error: 'Choose past, present or future.' };
  if (![...projects, NO_PROJECT].includes(project)) return { ok: false, error: 'Choose a project.' };
  if (typeof moodRaw !== 'string' || !/^\d{1,3}$/.test(moodRaw) || Number(moodRaw) > 100) return { ok: false, error: 'Mood is a whole number from 0 to 100.' };
  return { ok: true, value: { activity, on_task: Number(onTask), time_focus: timeFocus, project, mood: Number(moodRaw) } };
}

// ---------- scheduled work ----------

export async function planDay(env, cfg, nowMs, rand = cryptoRandom) {
  const day = localDay(nowMs, cfg.offsetMinutes);
  if (day < cfg.startDate || day > cfg.endDate) return 0;
  const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM pings WHERE day = ?').bind(day).first();
  if (existing && Number(existing.n) > 0) return 0;
  const times = scheduleDay(day, cfg, rand);
  await env.DB.batch(times.map((t) => env.DB.prepare('INSERT INTO pings (id, day, scheduled_at) VALUES (?, ?, ?)').bind(randomId(), day, t)));
  return times.length;
}

export async function sendDue(env, cfg, nowMs, fetcher = fetch) {
  const nowIso = new Date(nowMs).toISOString();
  const { results } = await env.DB.prepare("SELECT id, scheduled_at FROM pings WHERE send_status = 'pending' AND scheduled_at <= ? ORDER BY scheduled_at").bind(nowIso).all();
  const outcome = { sent: 0, failed: 0, skipped: 0 };
  for (const row of results ?? []) {
    if (nowMs - Date.parse(row.scheduled_at) > LATE_MINUTES * 60000) {
      await env.DB.prepare("UPDATE pings SET send_status = 'skipped' WHERE id = ?").bind(row.id).run();
      outcome.skipped += 1;
      continue;
    }
    const link = `${cfg.baseUrl}/p/${row.id}?s=${await sign(row.id, env.PING_SECRET)}`;
    const headers = { Title: 'Attention check', Click: link, Priority: 'high', Tags: 'bell' };
    if (env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`;
    let ok = false;
    try {
      const res = await fetcher(`${NTFY_SERVER}/${encodeURIComponent(env.NTFY_TOPIC)}`, { method: 'POST', headers, body: `Tap to answer. Open for ${cfg.expireMinutes} minutes.` });
      ok = res.ok;
    } catch {
      ok = false;
    }
    await env.DB.prepare('UPDATE pings SET send_status = ?, sent_at = ? WHERE id = ?').bind(ok ? 'sent' : 'failed', ok ? nowIso : null, row.id).run();
    outcome[ok ? 'sent' : 'failed'] += 1;
  }
  return outcome;
}

// ---------- HTTP ----------

const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
  'cache-control': 'no-store',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page(title, body, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px/1.4 system-ui,sans-serif;margin:0 auto;max-width:34rem;padding:1rem;color:#1b1b1b;background:#fff}fieldset{border:0;padding:0;margin:0 0 1.1rem}legend{font-weight:600;margin-bottom:.4rem}label{display:block;padding:.35rem 0}input[type=number]{font-size:1.1rem;width:6rem;padding:.3rem}button{font-size:1.05rem;padding:.6rem 1.4rem}.err{color:#a40000}@media (prefers-color-scheme:dark){body{background:#151515;color:#eee}}</style></head><body>${body}</body></html>`;
  return new Response(html, { status, headers: PAGE_HEADERS });
}

export function formHtml(id, sig, projects, error) {
  const radios = (name, options) => options.map(([v, l]) => `<label><input type="radio" name="${name}" value="${esc(v)}" required> ${esc(l)}</label>`).join('');
  return `<h1>Right now</h1>${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="/p/${esc(id)}?s=${esc(sig)}">
<fieldset><legend>What are you doing?</legend>${radios('activity', ACTIVITIES.map((a) => [a, a]))}</fieldset>
<fieldset><legend>Is your mind on what you are doing?</legend>${radios('on_task', [['1', 'Yes'], ['0', 'No, it is on something else']])}</fieldset>
<fieldset><legend>Are your thoughts about the past, the present or the future?</legend>${radios('time_focus', TIME_FOCUS.map((t) => [t, t[0].toUpperCase() + t.slice(1)]))}</fieldset>
<fieldset><legend>Which project is it for?</legend>${radios('project', [...projects, NO_PROJECT].map((p) => [p, p]))}</fieldset>
<fieldset><legend><label for="mood">Mood, 0 (very bad) to 100 (very good)</label></legend><input id="mood" name="mood" type="number" inputmode="numeric" min="0" max="100" step="1" required></fieldset>
<button type="submit">Save</button></form>`;
}

async function loadPing(env, id, sig) {
  if (!/^[0-9a-f]{16}$/.test(id) || !sameString(sig ?? '', await sign(id, env.PING_SECRET))) return null;
  return env.DB.prepare('SELECT id, send_status, sent_at, answered_at FROM pings WHERE id = ?').bind(id).first();
}

const expired = (row, cfg, nowMs) => nowMs - Date.parse(row.sent_at) > cfg.expireMinutes * 60000;

export async function handle(request, env, nowMs = Date.now()) {
  const cfg = config(env);
  const url = new URL(request.url);

  if (url.pathname === '/aggregates' && request.method === 'GET') {
    const auth = request.headers.get('authorization') ?? '';
    if (!env.EXPORT_TOKEN || !sameString(auth, `Bearer ${env.EXPORT_TOKEN}`)) return new Response('Not found', { status: 404 });
    const { results } = await env.DB.prepare('SELECT day, scheduled_at, send_status, sent_at, answered_at, activity, on_task, time_focus, project, mood FROM pings').all();
    const summary = summarise(results ?? [], { projects: cfg.projects, offsetMinutes: cfg.offsetMinutes });
    return new Response(JSON.stringify({ generated: new Date(nowMs).toISOString(), collection: { start: cfg.startDate, end: cfg.endDate }, summary }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const m = /^\/p\/([^/]+)$/.exec(url.pathname);
  if (!m || !['GET', 'POST'].includes(request.method)) return new Response('Not found', { status: 404 });
  const id = m[1];
  const sig = url.searchParams.get('s');
  const row = await loadPing(env, id, sig);
  if (!row || row.send_status !== 'sent') return page('Not found', '<p>This link is not valid.</p>', 404);
  if (row.answered_at) return page('Already saved', '<p>This ping is already answered. Thank you.</p>', 409);
  if (expired(row, cfg, nowMs)) return page('Expired', `<p>This ping closed ${cfg.expireMinutes} minutes after it was sent. It counts as missed.</p>`, 410);

  if (request.method === 'GET') return page('Right now', formHtml(id, sig, cfg.projects));

  const form = await request.formData();
  const check = validateAnswer(form, cfg.projects);
  if (!check.ok) return page('Right now', formHtml(id, sig, cfg.projects, check.error), 400);
  const v = check.value;
  const res = await env.DB.prepare('UPDATE pings SET answered_at = ?, activity = ?, on_task = ?, time_focus = ?, project = ?, mood = ? WHERE id = ? AND answered_at IS NULL')
    .bind(new Date(nowMs).toISOString(), v.activity, v.on_task, v.time_focus, v.project, v.mood, id)
    .run();
  if (!res.meta || res.meta.changes !== 1) return page('Already saved', '<p>This ping is already answered. Thank you.</p>', 409);
  return page('Saved', '<p>Saved. Thank you.</p>');
}

export default {
  fetch: (request, env) => handle(request, env),
  async scheduled(_event, env, ctx) {
    const cfg = config(env);
    const now = Date.now();
    ctx.waitUntil((async () => {
      await planDay(env, cfg, now);
      await sendDue(env, cfg, now);
    })());
  },
};
