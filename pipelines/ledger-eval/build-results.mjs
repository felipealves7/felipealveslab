// Builds data/ledger-eval/results.json from the stored run files in data/ledger-eval/runs/.
// Each run is scored again with score-run.mjs, the same scorer the benchmark workflow uses, so the
// numbers on the Ask the Ledger page are computed here and not typed in.
//
//   node pipelines/ledger-eval/build-results.mjs           score all stored runs (about a minute), write results.json
//   node pipelines/ledger-eval/build-results.mjs --check   score them and fail if results.json differs
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
export const root = fileURLToPath(new URL('../../', import.meta.url));
const dataDir = join(root, 'data/ledger-eval');
const scorer = fileURLToPath(new URL('./score-run.mjs', import.meta.url));
export const RESULTS_FILE = join(dataDir, 'results.json');

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// Scores one stored run file with score-run.mjs, in a temporary folder so nothing is written next to the data.
export async function scoreStored(file) {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-eval-'));
  try {
    copyFileSync(file, join(dir, 'run.json'));
    await run(process.execPath, ['--no-warnings', scorer, join(dir, 'run.json')], { maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(readFileSync(join(dir, 'run.scored.json'), 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const count = (questions, verdict) => questions.filter((q) => q.verdict === verdict).length;

// The compact form kept in results.json: totals per ledger, then each question's verdict on each ledger.
export function compact(scored, entry, runText) {
  const [first] = scored.scenarios;
  const ledgers = Object.fromEntries(scored.scenarios.map(({ scenario, summary: s, questions }) => [scenario, {
    right: s.right,
    total: s.total,
    figuresRight: s.correct_answer,
    figuresAsked: s.answerable,
    declinedCorrectly: s.correct_refusal,
    declinesAsked: s.expectedRefusals,
    declinedWrongly: count(questions, 'wrongly_refused'),
    wrongAnswers: count(questions, 'wrong_answer'),
    rightFiguresWrongShape: s.wrong_shape_right_figures,
    rejectedSql: s.rejected_sql,
    queryErrorsOrTimeouts: s.query_error + s.query_timeout,
    modelErrors: s.model_error,
  }]));
  const robust = new Map(scored.robust.cases.map((c) => [c.id, c.rightInEveryScenario]));
  const { usage, responseTiming: t } = scored.measurements;
  return {
    githubRunNumber: entry.githubRunNumber,
    githubRunId: entry.githubRunId,
    artifact: entry.artifact,
    artifactSha256: entry.artifactSha256,
    runFile: entry.file,
    runFileSha256: sha256(runText),
    model: scored.model,
    prompt: scored.prompt,
    promptSha256: scored.promptSha256,
    suite: scored.suite,
    status: scored.status,
    stopReason: scored.stopReason,
    questions: scored.measuredCases,
    rightOnAllFour: scored.robust.right,
    ledgers,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      neurons: Math.round(usage.pricingDerivedNeurons),
      listPriceUsd: Number(usage.listPriceEquivalentUsd.toFixed(4)),
    },
    responseMs: { median: Math.round(t.p50Ms), p95: Math.round(t.p95Ms), calls: t.sampleCount },
    // For every question that was not right on all four ledgers, also keep the SQL and what the ledgers returned.
    perQuestion: first.questions.map((q) => {
      const onEach = scored.scenarios.map((s) => ({ ledger: s.scenario, q: s.questions.find((x) => x.id === q.id) }));
      return {
        id: q.id,
        text: q.text,
        type: q.type,
        want: q.want.outcome,
        rightOnAllFour: robust.get(q.id),
        verdicts: onEach.map((e) => e.q.verdict),
        ...(robust.get(q.id) ? {} : {
          detail: {
            sql: q.sql,
            // The original ledger, plus any ledger where the verdict differs from it.
            ledgers: onEach.filter((e, i) => i === 0 || e.q.verdict !== onEach[0].q.verdict).map((e) => ({
              ledger: e.ledger,
              verdict: e.q.verdict,
              got: (e.q.rows ?? []).slice(0, 3),
              want: e.q.want.outcome === 'answer' ? e.q.want.result : 'decline',
            })),
          },
        }),
      };
    }),
  };
}

export async function buildAll() {
  const manifest = JSON.parse(readFileSync(join(dataDir, 'runs.json'), 'utf8'));
  const runs = await Promise.all(manifest.runs.map(async (entry) => {
    const path = join(dataDir, entry.file);
    return compact(await scoreStored(path), entry, readFileSync(path));
  }));
  return {
    note: 'Computed by pipelines/ledger-eval/build-results.mjs from the run files in runs/. Not hand-edited. Ledgers: original_seed_2027, new_seed_2028, zero_revenue, selective_perturbation, in that order in each verdicts list.',
    scoredWith: 'pipelines/ledger-eval/score-run.mjs',
    ledgerOrder: ['original_seed_2027', 'new_seed_2028', 'zero_revenue', 'selective_perturbation'],
    runs,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = JSON.stringify(await buildAll(), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (text !== readFileSync(RESULTS_FILE, 'utf8')) { console.error('results.json differs from a fresh scoring of the stored runs.'); process.exit(1); }
    console.log('results.json matches a fresh scoring of the stored runs.');
  } else {
    writeFileSync(RESULTS_FILE, text);
    console.log(`wrote ${RESULTS_FILE}`);
  }
}
