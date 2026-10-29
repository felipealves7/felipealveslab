// Scores a translator against the test set and writes the cached results the page reads.
// Run it: node pipelines/ask-the-ledger/evaluate.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLedger, ENTITIES, ACCOUNTS, FIRST_MONTH, LAST_MONTH } from './ledger.mjs';
import { METRICS, execute, REPORT_MONTH } from './semantic.mjs';
import { translate } from './translate.mjs';
import { QUESTIONS, truth } from './gold.mjs';

export const SEED = 2027;

export function sameResult(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'scalar') return Math.abs(a.value - b.value) < 0.05;
  if (a.rows.length !== b.rows.length) return false;
  return a.rows.every((r, i) => r.label === b.rows[i].label && Math.abs(r.value - b.rows[i].value) < 0.05);
}

/** One question: what the translator did, and was it right. */
export function judge(rows, question, translator = translate) {
  const want = truth(rows, question);
  const got = translator(question.text);
  let verdict;
  let result = null;
  if (got.outcome === 'refuse') {
    verdict = want.outcome === 'refuse' ? 'correct_refusal' : 'wrongly_refused';
  } else {
    result = execute(rows, got.spec);
    if (result.kind === 'no_data') {
      verdict = want.outcome === 'refuse' ? 'correct_refusal' : 'wrongly_refused';
    } else if (want.outcome === 'refuse') {
      verdict = 'wrong_answer'; // answered when it should have asked back
    } else {
      verdict = sameResult(result, want.result) ? 'correct_answer' : 'wrong_answer';
    }
  }
  return { id: question.id, text: question.text, type: question.type, want, got, result, verdict };
}

export function score(judged) {
  const count = (v) => judged.filter((j) => j.verdict === v).length;
  const byType = {};
  for (const j of judged) {
    byType[j.type] ??= { total: 0, right: 0 };
    byType[j.type].total += 1;
    if (j.verdict === 'correct_answer' || j.verdict === 'correct_refusal') byType[j.type].right += 1;
  }
  return {
    total: judged.length,
    correct_answer: count('correct_answer'),
    correct_refusal: count('correct_refusal'),
    wrong_answer: count('wrong_answer'),
    wrongly_refused: count('wrongly_refused'),
    byType,
  };
}

export function buildResults() {
  const rows = buildLedger({ seed: SEED });
  const judged = QUESTIONS.map((q) => judge(rows, q));
  return {
    generatedBy: 'pipelines/ask-the-ledger/evaluate.mjs',
    synthetic: true,
    seed: SEED,
    translator: 'keyword rules (pipelines/ask-the-ledger/translate.mjs), no language model',
    ledger: {
      rows: rows.length,
      entities: ENTITIES,
      accounts: ACCOUNTS.map((a) => ({ account: a.account, group: a.group })),
      from: FIRST_MONTH,
      to: LAST_MONTH,
      unit: 'AED thousand',
      questionsAskedIn: REPORT_MONTH,
    },
    semanticLayer: Object.entries(METRICS).map(([key, m]) => ({ key, label: m.label, definition: m.definition, unit: m.unit, words: m.words })),
    summary: score(judged),
    questions: judged,
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
export const OUTPUTS = [join(root, 'data/ask-the-ledger/results.json'), join(root, 'public/data/ask-the-ledger/results.json')];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = JSON.stringify(buildResults(), null, 2) + '\n';
  for (const out of OUTPUTS) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, json);
  }
  const s = JSON.parse(json).summary;
  console.log(JSON.stringify(s, null, 2));
}
