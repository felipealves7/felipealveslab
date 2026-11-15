// Guarded benchmark runner. Sends each question, with the chosen system prompt, to Workers AI and saves
// the raw reply, the parsed SQL, the response time and the token counts after every call.
//
//   node pipelines/ledger-eval/run.mjs --dry-run            (no credentials, no network)
//   node pipelines/ledger-eval/run.mjs --prompt baseline --suite legacy47 --max-requests 5 \
//     --free-budget-neurons 500 --out ledger-eval-runs/pilot.json
//
// A real run needs CF_ACCOUNT_ID, CF_API_TOKEN (a Workers AI token, nothing more) and
// LEDGER_ACCOUNT_PLAN=free in the environment. "baseline" is the live Worker's prompt.
// It stops at the request cap, before a call that could go over the budget, on any HTTP or provider
// error, and when a reply has no token counts. The same --out resumes; finished questions are skipped.
// A call that gets no answer within 30 seconds is tried once more (at most MAX_TIMEOUT_RETRIES times a
// run); the lost call's full reservation is counted as spent, because it may still have used neurons.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { cases } from './cases.mjs';
import { SYSTEM_PROMPT, parseModelReply } from '../ledger-api/worker.mjs';
import { infer, actualUsage, reserveNeurons } from './cloudflare.mjs';

const argv = process.argv.slice(2);
const value = (key, fallback) => {
  const i = argv.indexOf(key);
  return i < 0 ? fallback : argv[i + 1];
};
const sha = (s) => createHash('sha256').update(s).digest('hex');

const config = JSON.parse(readFileSync(new URL('./models.json', import.meta.url), 'utf8'));
const model = value('--model', '@cf/qwen/qwen2.5-coder-32b-instruct');
const profile = value('--prompt', 'baseline');
const suite = value('--suite', 'legacy47');
if (!['baseline', 'candidate'].includes(profile) || !['legacy47', 'validation20', 'all'].includes(suite) || !config.models[model]) {
  throw new Error('unknown prompt, suite or model');
}
const system = profile === 'baseline' ? SYSTEM_PROMPT : readFileSync(new URL('./candidate-prompt.txt', import.meta.url), 'utf8').trim();
const selected = cases.filter((c) => suite === 'all' || c.suite === suite);
const rates = config.models[model];
const maxRequests = Number(value('--max-requests', '5'));
if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > cases.length) throw new Error(`--max-requests must be 1..${cases.length}`);
const dry = argv.includes('--dry-run');
const plan = {
  mode: dry ? 'dry_run' : 'inference',
  model,
  prompt: profile,
  promptSha256: sha(system),
  suite,
  suiteSha256: sha(JSON.stringify(selected.map((c) => ({ id: c.id, text: c.text })))),
  availableCases: selected.length,
  maxRequests,
  maxOutputTokens: 400,
  temperature: 0,
  requestOptions: config.models[model].requestOptions ?? null,
  networkCalls: dry ? 0 : 'not yet started',
  requiredEnvironment: ['CF_ACCOUNT_ID', 'CF_API_TOKEN', 'LEDGER_ACCOUNT_PLAN=free'],
  note: 'Free-plan confirmation and an explicit neuron budget are required. No automatic retries or recurring jobs.',
};
if (dry) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const account = process.env.CF_ACCOUNT_ID;
const token = process.env.CF_API_TOKEN;
if (!account || !token || process.env.LEDGER_ACCOUNT_PLAN !== 'free') {
  throw new Error('BLOCKED: needs CF_ACCOUNT_ID, CF_API_TOKEN and LEDGER_ACCOUNT_PLAN=free. No requests sent.');
}
const budget = Number(value('--free-budget-neurons', 'NaN'));
if (!Number.isFinite(budget) || budget <= 0 || budget > 10000) throw new Error('Give --free-budget-neurons, 0 < n <= 10000. No requests sent.');
const outArg = value('--out');
if (!outArg) throw new Error('Give --out with the run file path. No requests sent.');
const out = resolve(outArg);

const run = existsSync(out)
  ? JSON.parse(readFileSync(out, 'utf8'))
  : { kind: 'actual_cloudflare_rest_inference', plan, startedAt: new Date().toISOString(), records: [] };
if (run.plan.model !== model || run.plan.promptSha256 !== plan.promptSha256 || run.plan.suiteSha256 !== plan.suiteSha256) {
  throw new Error('The existing run file is for another model, prompt or suite; choose a different --out.');
}
delete run.stopReason;
const save = () => {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(run, null, 2) + '\n');
};

const MAX_TIMEOUT_RETRIES = 3;
let spentThisInvocation = 0;
let calls = 0;
let timeoutRetries = 0;
for (const c of selected) {
  if (run.records.some((r) => r.id === c.id)) continue;
  if (calls >= maxRequests) {
    run.stopReason = 'request_cap';
    break;
  }
  const messages = [{ role: 'system', content: system }, { role: 'user', content: c.text }];
  if (reserveNeurons(messages, rates) > budget - spentThisInvocation) {
    run.stopReason = 'budget_reservation';
    break;
  }
  let response;
  let attempts = 0;
  for (;;) {
    calls++;
    attempts++;
    try {
      response = await infer({ account, token, model, messages, options: rates.requestOptions ?? {} });
    } catch (e) {
      response = { ok: false, error: e.name === 'TimeoutError' ? 'timeout' : 'network_error' };
    }
    if (response.error !== 'timeout' || attempts > 1 || timeoutRetries >= MAX_TIMEOUT_RETRIES) break;
    spentThisInvocation += reserveNeurons(messages, rates);
    if (reserveNeurons(messages, rates) > budget - spentThisInvocation) break;
    timeoutRetries++;
  }
  const raw = response.result?.response ?? response.result?.choices?.[0]?.message?.content;
  const parsed = parseModelReply(raw);
  const usage = actualUsage(response.result, rates);
  const record = {
    id: c.id,
    question: c.text,
    requestedAt: new Date().toISOString(),
    httpStatus: response.httpStatus ?? null,
    elapsedMs: response.elapsedMs ?? null,
    raw: raw ?? null,
    sql: parsed?.sql ?? null,
    explanation: parsed?.explanation ?? null,
    modelError: !response.ok || !parsed,
    usage,
    error: response.error ?? null,
    attempts,
  };
  run.records.push(record);
  run.updatedAt = new Date().toISOString();
  save();
  if (usage) spentThisInvocation += usage.pricingDerivedNeurons;
  console.log(JSON.stringify({ id: c.id, ok: !record.modelError, httpStatus: record.httpStatus, elapsedMs: record.elapsedMs, usage }));
  if (!response.ok) {
    run.stopReason = 'provider_or_transport_error';
    break;
  }
  if (!usage) {
    run.stopReason = 'usage_missing_requires_manual_budget_check';
    break;
  }
}
run.status = run.records.length === selected.length ? 'complete' : 'partial';
run.stopReason ??= 'suite_complete';
run.lastInvocation = { calls, timeoutRetries, pricingDerivedNeurons: spentThisInvocation, budgetNeurons: budget };
save();
console.log(JSON.stringify({ output: out, status: run.status, records: run.records.length, stopReason: run.stopReason }));
if (['provider_or_transport_error', 'usage_missing_requires_manual_budget_check'].includes(run.stopReason)) process.exit(2);
