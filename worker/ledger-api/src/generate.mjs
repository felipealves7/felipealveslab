// One function for the model call. MODEL_PROVIDER picks the backend:
//   "workers-ai" (default): Cloudflare Workers AI through the AI binding. No key.
//   "anthropic": Claude Haiku through the Messages API. Needs the Worker secret ANTHROPIC_API_KEY, set in Cloudflare, never in the repo.

import { SCHEMA_SQL } from './schema.mjs';

export const MAX_TOKENS = 400;
export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct'; // not verified against Cloudflare's current model list
export const ANTHROPIC_MODEL = 'claude-haiku-5-5';

export const SYSTEM_PROMPT = `You write one read-only SQLite query that answers a question about a finance ledger.
The tables are:

${SCHEMA_SQL}
Amounts are in AED. Dates are text in YYYY-MM-DD form. The data covers 2026-01-01 to 2026-09-30.
Reply with JSON only, no other text, in this shape:
{"sql": "<one SELECT statement>", "explanation": "<one short paragraph in plain English>"}
Use only the tables above. Never write to the database. If the question cannot be answered from these tables, use {"sql": "", "explanation": "<why not>"}.`;

/** Pulls {sql, explanation} out of a model reply, tolerating code fences and text around the JSON. */
export function parseModelReply(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    if (typeof obj.sql !== 'string') return null;
    return { sql: obj.sql, explanation: typeof obj.explanation === 'string' ? obj.explanation : '' };
  } catch {
    return null;
  }
}

export async function generate(question, env) {
  const provider = env.MODEL_PROVIDER || 'workers-ai';
  let text;
  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: question }] }),
    });
    if (!res.ok) throw new Error(`model request failed: ${res.status}`);
    const body = await res.json();
    text = body.content?.find((c) => c.type === 'text')?.text;
  } else {
    const out = await env.AI.run(env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL, {
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: question },
      ],
    });
    text = typeof out === 'string' ? out : out?.response;
  }
  return parseModelReply(text);
}
