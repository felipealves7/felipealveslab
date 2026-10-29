// Asks the model to write SQL for every test question and saves queries.json for score-sql.mjs.
// Uses Cloudflare's REST API for Workers AI, through the same generate() the Worker uses.
// Needs CF_ACCOUNT_ID and CF_API_TOKEN in the environment of whoever runs it. They are never written anywhere.
//   node pipelines/ledger-api/generate-queries.mjs out.json
// This calls the model 47 times and is separate from the Worker's daily cap. I could not run it
// in the build session (no Cloudflare credentials), so no model score exists yet.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QUESTIONS } from '../ask-the-ledger/gold.mjs';
import { generate, DEFAULT_WORKERS_AI_MODEL } from './worker.mjs';

export function restAi(accountId, token, fetchFn = fetch) {
  return {
    async run(model, input) {
      const res = await fetchFn(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`Workers AI returned ${res.status}`);
      return (await res.json()).result;
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { CF_ACCOUNT_ID, CF_API_TOKEN } = process.env;
  const out = process.argv[2];
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !out) {
    console.error('Usage: CF_ACCOUNT_ID=... CF_API_TOKEN=... node generate-queries.mjs out.json');
    process.exit(1);
  }
  const env = { AI: restAi(CF_ACCOUNT_ID, CF_API_TOKEN), MODEL_PROVIDER: 'workers-ai' };
  const queries = [];
  for (const q of QUESTIONS) {
    try {
      const reply = await generate(env, q.text);
      queries.push(reply ? { id: q.id, sql: reply.sql } : { id: q.id, sql: null, error: true });
    } catch {
      queries.push({ id: q.id, sql: null, error: true }); // scored as a model error, not as a refusal
    }
  }
  writeFileSync(out, JSON.stringify(queries, null, 2) + '\n');
  console.log(`wrote ${queries.length} queries from ${DEFAULT_WORKERS_AI_MODEL}`);
}
