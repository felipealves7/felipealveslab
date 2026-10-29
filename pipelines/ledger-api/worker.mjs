// Cloudflare Worker `ledger-api`: plain-English question -> SQL -> rows -> explanation.
// Bindings: LEDGER (D1), COUNTERS (KV), AI (Workers AI). Optional secret ANTHROPIC_API_KEY, set in Cloudflare only.
// Settings (wrangler.toml [vars]): MODEL_PROVIDER = "workers-ai" | "anthropic".

import { validateSql, MAX_ROWS } from './validate.mjs';

export const LIMITS = { perVisitor: 2, perDay: 50, questionChars: 300, maxTokens: 400 };
export const ORIGIN = 'https://felipealveslab.com';
export const RECORDED_SESSION = 'https://felipealveslab.com/lab/ask-the-ledger/#recorded-session';
export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct'; // not verified against Cloudflare's current model list
export const HAIKU_MODEL = 'claude-haiku-5-5';

export const SYSTEM_PROMPT = `You write one read-only SQLite query for a synthetic finance ledger.
Table ledger(entity TEXT, month TEXT 'YYYY-MM', account TEXT, account_group TEXT, amount INTEGER).
account_group is 'Revenue', 'Cost of sales' or 'Operating expense'. Amounts are thousands of AED, data runs 2025-01 to 2026-09.
Entities: North Hub, Harbour Retail, Delta Services, Summit Logistics, Orchard Foods, Lakeside Energy.
Accounts: Product sales, Service fees (Revenue); Materials, Direct labour (Cost of sales); Payroll, Rent, Marketing, IT (Operating expense).
Gross profit = Revenue - Cost of sales. Operating profit = Revenue - Cost of sales - Operating expense.
If the question is ambiguous or the ledger cannot answer it, set "sql" to null and say why.
Reply with JSON only: {"sql": string or null, "explanation": "one short paragraph"}`;

const json = (body, status, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export function allowedOrigin(origin, env) {
  if (origin === ORIGIN) return true;
  return env.ENVIRONMENT === 'development' && /^http:\/\/localhost(:\d+)?$/.test(origin ?? '');
}

async function visitorKey(request, day) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip)); // the IP itself is never stored
  const hex = [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `v:${day}:${hex}`;
}

const readCount = async (kv, key) => Number((await kv.get(key)) ?? 0);
const bump = async (kv, key) => kv.put(key, String((await readCount(kv, key)) + 1), { expirationTtl: 172800 });

/** Pulls {sql, explanation} out of the model's text. Returns null when it is not usable JSON. */
export function parseModelReply(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (o.sql !== null && typeof o.sql !== 'string') return null;
    return { sql: o.sql, explanation: typeof o.explanation === 'string' ? o.explanation : '' };
  } catch {
    return null;
  }
}

/** The only place a model is called. */
export async function generate(env, question, fetchFn = fetch) {
  const provider = env.MODEL_PROVIDER ?? 'workers-ai';
  if (provider === 'anthropic') {
    const res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: HAIKU_MODEL, max_tokens: LIMITS.maxTokens, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: question }] }),
    });
    if (!res.ok) throw new Error(`model returned ${res.status}`);
    const data = await res.json();
    return parseModelReply(data.content?.[0]?.text);
  }
  const out = await env.AI.run(env.WORKERS_AI_MODEL ?? DEFAULT_WORKERS_AI_MODEL, {
    max_tokens: LIMITS.maxTokens,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: question }],
  });
  return parseModelReply(out?.response);
}

export async function handle(request, env, deps = {}) {
  const gen = deps.generate ?? generate;
  const day = (deps.now ? deps.now() : new Date()).toISOString().slice(0, 10);
  const origin = request.headers.get('Origin');

  // 1. Origin
  if (!allowedOrigin(origin, env)) return json({ error: 'forbidden' }, 403);
  const cors = { 'access-control-allow-origin': origin, vary: 'Origin' };
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' } });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  let question;
  try {
    question = (await request.json()).question;
  } catch {
    return json({ error: 'bad_request', message: 'Send JSON like {"question": "..."}.' }, 400, cors);
  }
  if (typeof question !== 'string' || !question.trim()) return json({ error: 'bad_request', message: 'Ask a question first.' }, 400, cors);
  if (question.length > LIMITS.questionChars) {
    return json({ error: 'too_long', message: `Keep the question under ${LIMITS.questionChars} characters.` }, 400, cors);
  }

  // 2. Per visitor
  const vKey = await visitorKey(request, day);
  if ((await readCount(env.COUNTERS, vKey)) >= LIMITS.perVisitor) {
    return json({ error: 'visitor_limit', message: `That is ${LIMITS.perVisitor} questions today. Come back tomorrow, or read the recorded session.`, recordedSession: RECORDED_SESSION }, 429, cors);
  }
  // 3. Global daily
  const gKey = `g:${day}`;
  if ((await readCount(env.COUNTERS, gKey)) >= LIMITS.perDay) {
    return json({ error: 'daily_limit', message: 'The daily question budget is used up. Come back tomorrow.', recordedSession: RECORDED_SESSION }, 429, cors);
  }

  // 4. Generate. From here the request counts, even if it fails.
  let reply = null;
  let failed = false;
  try {
    reply = await gen(env, question);
  } catch {
    failed = true;
  } finally {
    await bump(env.COUNTERS, vKey);
    await bump(env.COUNTERS, gKey);
  }
  if (failed) return json({ error: 'model_unavailable', message: 'The model did not answer. Read the recorded session instead.', recordedSession: RECORDED_SESSION }, 502, cors);
  if (!reply) return json({ error: 'unusable_reply', message: 'The model reply could not be read, so nothing was run.' }, 502, cors);
  if (reply.sql === null) return json({ sql: null, rows: [], explanation: reply.explanation, declined: true }, 200, cors);

  // 5. Validate, then run
  const checked = validateSql(reply.sql);
  if (!checked.ok) return json({ error: 'invalid_sql', message: `The generated query was rejected (${checked.reason}) and was not run.` }, 422, cors);
  let rows;
  try {
    const out = await env.LEDGER.prepare(checked.sql).all();
    rows = out.results ?? [];
  } catch {
    return json({ error: 'query_failed', sql: checked.sql, message: 'The query was valid but the database could not run it.' }, 422, cors);
  }

  // 6. Respond
  return json({ sql: checked.sql, rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS, explanation: reply.explanation }, 200, cors);
}

export default { fetch: (request, env) => handle(request, env) };
