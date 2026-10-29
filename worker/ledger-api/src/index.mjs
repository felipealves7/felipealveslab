// ledger-api: answers a plain-English question about the synthetic ledger.
// Six checks in order: origin, per-visitor cap, global daily cap, generate, validate and run, respond and count.
// No secret is read except env.ANTHROPIC_API_KEY, and only when MODEL_PROVIDER is "anthropic".

import { generate as defaultGenerate } from './generate.mjs';
import { validateSql, MAX_ROWS } from './validate.mjs';
import { checkCaps, count, globalKey, visitorKey, utcDate, MAX_QUESTION_CHARS, PER_VISITOR_PER_DAY, GLOBAL_PER_DAY } from './limits.mjs';

export const ALLOWED_ORIGIN = 'https://felipealveslab.com';
const DEV_ORIGINS = ['http://localhost:4321', 'http://127.0.0.1:4321'];
export const RECORDED_SESSION = 'https://felipealveslab.com/lab/ask-the-ledger#recorded-session';

const originAllowed = (origin, env) => origin === ALLOWED_ORIGIN || (env.ENVIRONMENT === 'development' && DEV_ORIGINS.includes(origin));

function reply(status, body, origin) {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  if (origin) Object.assign(headers, { 'access-control-allow-origin': origin, vary: 'Origin' });
  return new Response(JSON.stringify(body), { status, headers });
}

/** @param deps.generate  replaceable in tests */
export async function handle(request, env, deps = {}) {
  const generate = deps.generate || defaultGenerate;
  const origin = request.headers.get('origin');

  // 1. Origin
  if (!origin || !originAllowed(origin, env)) return reply(403, { ok: false, reason: 'origin', message: 'Not allowed from this origin.' });
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'Origin' } });
  }
  if (request.method !== 'POST') return reply(405, { ok: false, reason: 'method', message: 'Use POST.' }, origin);

  let question;
  try {
    question = (await request.json())?.question;
  } catch {
    return reply(400, { ok: false, reason: 'bad_request', message: 'Send JSON like {"question": "..."}.' }, origin);
  }
  if (typeof question !== 'string' || !question.trim()) return reply(400, { ok: false, reason: 'bad_request', message: 'Ask a question first.' }, origin);
  question = question.trim();
  if (question.length > MAX_QUESTION_CHARS) {
    return reply(400, { ok: false, reason: 'too_long', message: `Keep the question under ${MAX_QUESTION_CHARS} characters (yours was ${question.length}).` }, origin);
  }

  // 2 and 3. Caps
  const date = utcDate();
  const vKey = await visitorKey(request.headers.get('cf-connecting-ip'), date);
  const gKey = globalKey(date);
  const caps = await checkCaps(env.COUNTERS, vKey, gKey);
  if (!caps.ok) {
    const message = caps.reason === 'visitor_limit'
      ? `You have used your ${PER_VISITOR_PER_DAY} questions for today. Come back tomorrow, or read the recorded session.`
      : `The ${GLOBAL_PER_DAY} questions for today are used up. Come back tomorrow, or read the recorded session.`;
    return reply(429, { ok: false, reason: caps.reason, message, recordedSession: RECORDED_SESSION }, origin);
  }

  // 4. Generate. A request that reaches the model counts even if it fails, so count first.
  await count(env.COUNTERS, vKey, gKey, caps);
  let draft;
  try {
    draft = await generate(question, env);
  } catch {
    return reply(502, { ok: false, reason: 'model_error', message: 'The model did not answer. This question still counted. Read the recorded session instead.', recordedSession: RECORDED_SESSION }, origin);
  }
  if (!draft) return reply(200, { ok: false, reason: 'unreadable_reply', message: 'The model replied in a shape I could not read, so nothing was run.', recordedSession: RECORDED_SESSION }, origin);
  if (!draft.sql.trim()) return reply(200, { ok: true, sql: null, columns: [], rows: [], explanation: draft.explanation, note: 'The model said the ledger cannot answer this.' }, origin);

  // 5. Validate and run
  const checked = validateSql(draft.sql);
  if (!checked.ok) return reply(200, { ok: false, reason: 'rejected_sql', message: `The query was rejected and not run: ${checked.reason}.`, rejectedSql: draft.sql, explanation: draft.explanation }, origin);
  let rows;
  try {
    const res = await env.LEDGER.prepare(checked.sql).all();
    rows = (res.results || []).slice(0, MAX_ROWS);
  } catch {
    return reply(200, { ok: false, reason: 'query_error', message: 'The query passed the checks but the database could not run it.', sql: checked.sql, explanation: draft.explanation }, origin);
  }

  // 6. Respond
  const used = caps.visitor + 1;
  return reply(200, { ok: true, sql: checked.sql, columns: rows[0] ? Object.keys(rows[0]) : [], rows, explanation: draft.explanation, questionsLeftToday: Math.max(0, PER_VISITOR_PER_DAY - used) }, origin);
}

export default { fetch: (request, env) => handle(request, env) };
