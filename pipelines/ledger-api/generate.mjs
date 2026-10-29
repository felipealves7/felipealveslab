// The one place the Worker talks to a language model.
// MODEL_PROVIDER = "workers-ai" (default, no key) or "anthropic" (needs the Worker secret ANTHROPIC_API_KEY).

import { SCHEMA_SQL, DEFINITIONS } from './schema.mjs';

export const MAX_TOKENS = 400;
export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct'; // not verified against Cloudflare's current catalogue
export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';

export function buildPrompt(question) {
  const system = `You write one read-only SQLite query that answers a question about a synthetic finance ledger.
Schema:
${SCHEMA_SQL}
Definitions:
${DEFINITIONS}
Rules: one SELECT statement only, table "ledger" only, no comments.
If the question is ambiguous (for example "profit" or "costs" with no definition) or the ledger cannot answer it, set "sql" to null and say why in "explanation".
Reply with JSON only: {"sql": "<query or null>", "explanation": "<one short paragraph for a finance reader>"}`;
  return { system, user: question };
}

/** Pull {sql, explanation} out of whatever text the model returned. Returns null if there is none. */
export function parseModelOutput(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      obj = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const sql = typeof obj.sql === 'string' && obj.sql.trim() ? obj.sql : null;
  const explanation = typeof obj.explanation === 'string' ? obj.explanation.slice(0, 600) : '';
  return { sql, explanation };
}

async function viaWorkersAi(env, { system, user }) {
  const out = await env.AI.run(env.MODEL_NAME || DEFAULT_WORKERS_AI_MODEL, {
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: MAX_TOKENS,
  });
  return out?.response ?? out;
}

async function viaAnthropic(env, { system, user }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: env.MODEL_NAME || DEFAULT_ANTHROPIC_MODEL, max_tokens: MAX_TOKENS, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`model provider returned ${res.status}`);
  const body = await res.json();
  return body.content?.find((b) => b.type === 'text')?.text ?? '';
}

/** question -> { sql, explanation } | null. Throws if the provider fails. */
export async function generate(env, question) {
  const prompt = buildPrompt(question);
  const raw = env.MODEL_PROVIDER === 'anthropic' ? await viaAnthropic(env, prompt) : await viaWorkersAi(env, prompt);
  return parseModelOutput(raw);
}
