// ledger-api: POST /ask {question} -> generated SQL, rows and a short explanation.
// Bindings: LEDGER (D1), COUNTERS (KV), AI (Workers AI). Optional secret: ANTHROPIC_API_KEY.
// Checks, in order: origin, method and input, per-visitor cap, global daily cap, generate, validate and run, count.

import { generate } from './generate.mjs';
import { validateSql, ROW_LIMIT } from './validate.mjs';

export const SITE_ORIGIN = 'https://felipealveslab.com';
export const MAX_QUESTION_CHARS = 300;
export const DEFAULT_VISITOR_CAP = 2;
export const DEFAULT_DAILY_CAP = 50;
const RECORDED_URL = `${SITE_ORIGIN}/lab/ask-the-ledger/#recorded-session`;
const TWO_DAYS = 172800;

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (origin === SITE_ORIGIN) return origin;
  if (env.ALLOW_LOCALHOST === '1' && origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

async function visitorKey(request, day) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  const hex = [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `v:${day}:${hex}`;
}

async function readCount(kv, key) {
  return Number((await kv.get(key)) ?? 0) || 0;
}

async function bump(kv, key) {
  await kv.put(key, String(((await readCount(kv, key)) || 0) + 1), { expirationTtl: TWO_DAYS });
}

export async function handle(request, env, now = new Date()) {
  const origin = allowedOrigin(request, env);
  if (!origin) return new Response('Forbidden', { status: 403 });
  const cors = { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
  // "recorded: true" tells the page to show the recorded example session instead.
  const stop = (status, code, message) => reply(status, { ok: false, code, message, recorded: true, recordedUrl: RECORDED_URL });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (new URL(request.url).pathname !== '/ask' || request.method !== 'POST') return reply(404, { ok: false, code: 'not_found', message: 'Not found.' });

  let question;
  try {
    question = (await request.json())?.question;
  } catch {
    return reply(400, { ok: false, code: 'bad_request', message: 'Send JSON like {"question": "..."}.' });
  }
  if (typeof question !== 'string' || !question.trim()) return reply(400, { ok: false, code: 'bad_request', message: 'Ask a question first.' });
  question = question.trim();
  if (question.length > MAX_QUESTION_CHARS) return reply(400, { ok: false, code: 'too_long', message: `Keep the question under ${MAX_QUESTION_CHARS} characters.` });

  const day = now.toISOString().slice(0, 10);
  const visitorCap = Number(env.VISITOR_CAP) || DEFAULT_VISITOR_CAP;
  const dailyCap = Number(env.DAILY_CAP) || DEFAULT_DAILY_CAP;
  const vKey = await visitorKey(request, day);
  const gKey = `g:${day}`;

  if ((await readCount(env.COUNTERS, vKey)) >= visitorCap) {
    return stop(429, 'visitor_limit', `You have used your ${visitorCap} questions for today. The recorded example session shows what a run looks like.`);
  }
  if ((await readCount(env.COUNTERS, gKey)) >= dailyCap) {
    return stop(429, 'daily_limit', 'The live questions for today are used up. Come back tomorrow, or read the recorded example session.');
  }

  // From here the model is called, so the question counts even if it fails.
  let generated = null;
  let failed = false;
  try {
    generated = await generate(env, question);
  } catch {
    failed = true;
  }
  await bump(env.COUNTERS, vKey);
  await bump(env.COUNTERS, gKey);

  if (failed) return stop(502, 'model_unavailable', 'The model did not answer. Try again later, or read the recorded example session.');
  if (!generated) return stop(502, 'bad_model_output', 'The model returned something I could not read. The recorded example session shows a normal run.');
  if (!generated.sql) return reply(200, { ok: true, declined: true, sql: null, columns: [], rows: [], explanation: generated.explanation || 'The model declined to write a query.' });

  const checked = validateSql(generated.sql);
  if (!checked.ok) return stop(422, 'query_rejected', `The generated query failed the safety checks (${checked.reason}) and was not run.`);

  try {
    const { results = [] } = await env.LEDGER.prepare(checked.sql).all();
    const rows = results.slice(0, ROW_LIMIT);
    return reply(200, { ok: true, declined: false, sql: checked.sql, columns: rows[0] ? Object.keys(rows[0]) : [], rows, explanation: generated.explanation });
  } catch {
    return stop(422, 'query_failed', 'The generated query did not run on the ledger. It was discarded.');
  }
}

export default { fetch: (request, env) => handle(request, env) };
