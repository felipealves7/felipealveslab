// Scores a saved run. Each generated query is checked with the live Worker's validator and run, in its
// own process with a 2-second deadline, on all four ledgers. Writes <run>.scored.json next to the run
// and prints a short Markdown summary (the workflow adds it to the job page).
//
//   node pipelines/ledger-eval/score-run.mjs ledger-eval-runs/pilot.json

import { readFileSync, writeFileSync } from 'node:fs';
import { cases } from './cases.mjs';
import { scenarios } from './scenarios.mjs';
import { evaluateSafely } from './safe-scoring.mjs';
import { summarize } from './scoring.mjs';
import { measurements } from './measurement.mjs';

const input = process.argv[2];
if (!input) throw new Error('Usage: node pipelines/ledger-eval/score-run.mjs <run.json>');
const run = JSON.parse(readFileSync(input, 'utf8'));
const records = run.records ?? [];
if (run.kind !== 'actual_cloudflare_rest_inference') throw new Error('Only saved Workers AI runs are accepted as benchmark evidence.');
if (new Set(records.map((r) => r.id)).size !== records.length) throw new Error('Duplicate case IDs');

const outputs = [];
for (const world of scenarios()) {
  const results = [];
  for (const r of records) {
    const c = cases.find((x) => x.id === r.id);
    if (!c || c.text !== r.question) throw new Error(`Question mismatch for ${r.id}`);
    results.push(await evaluateSafely(world.rows, c, r.sql, { modelError: r.modelError }));
  }
  outputs.push({ scenario: world.name, summary: summarize(results), questions: results });
}
const isRight = (v) => ['correct_answer', 'correct_refusal'].includes(v);
const robust = records.map((r) => ({ id: r.id, rightInEveryScenario: outputs.every((o) => isRight(o.questions.find((q) => q.id === r.id).verdict)) }));
const scored = {
  kind: 'measured_model_scorecard',
  status: run.status,
  model: run.plan.model,
  prompt: run.plan.prompt,
  promptSha256: run.plan.promptSha256,
  suite: run.plan.suite,
  measuredCases: records.length,
  expectedCases: run.plan.availableCases,
  stopReason: run.stopReason ?? null,
  generatedAt: new Date().toISOString(),
  note: 'A partial run is not a complete benchmark. Reference SQL and mocked tests are not model scores.',
  measurements: measurements(records, outputs[0]?.summary ?? { correct_answer: 0, right: 0 }),
  scenarios: outputs,
  robust: { right: robust.filter((r) => r.rightInEveryScenario).length, total: robust.length, cases: robust },
};
const output = input.replace(/\.json$/, '.scored.json');
writeFileSync(output, JSON.stringify(scored, null, 2) + '\n');

const of = (n, d) => `${n} of ${d}`;
const ms = (v) => (v === null ? 'n/a' : `${Math.round(v)} ms`);
const m = scored.measurements;
const last = records.at(-1);
const lines = [
  '### Ask the Ledger benchmark',
  '',
  `\`${scored.model}\` · prompt \`${scored.prompt}\` (sha256 ${String(scored.promptSha256).slice(0, 12)}) · suite \`${scored.suite}\` · ${scored.status}: ${of(scored.measuredCases, scored.expectedCases)} questions · stop: ${scored.stopReason}`,
  '',
];
if (last?.modelError && (last.httpStatus !== 200 || last.error)) {
  lines.push(`The last call failed: ${last.error ?? `HTTP ${last.httpStatus}`}${last.httpStatus === 401 || last.httpStatus === 403 ? ' (check the CF_AI_TOKEN and CF_ACCOUNT_ID secrets)' : ''}.`, '');
}
if (!records.length) {
  lines.push('No questions were sent, so there is nothing to score.');
} else {
  lines.push(
    '| Ledger | Right | Figures right | Refusals right | Right figures, wrong shape | Rejected SQL | Query errors or timeouts | Model errors |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...outputs.map(({ scenario, summary: s }) => `| ${scenario} | ${of(s.right, s.total)} | ${of(s.correct_answer, s.answerable)} | ${of(s.correct_refusal, s.expectedRefusals)} | ${s.wrong_shape_right_figures} | ${s.rejected_sql} | ${s.query_error + s.query_timeout} | ${s.model_error} |`),
    '',
    `Right on all four ledgers: ${of(scored.robust.right, scored.robust.total)}.`,
    m.usage.telemetryComplete
      ? `Usage from token counts at list rates: ${m.usage.pricingDerivedNeurons.toFixed(0)} neurons (US$${m.usage.listPriceEquivalentUsd.toFixed(4)} at list price; not a bill).`
      : 'Usage: some calls returned no token counts, so no total is given.',
    `Response time: median ${ms(m.responseTiming.p50Ms)}, p95 ${ms(m.responseTiming.p95Ms)}, from ${m.responseTiming.sampleCount} calls.`,
  );
}
console.log(lines.join('\n'));
