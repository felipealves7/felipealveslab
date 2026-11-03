// Checks that the stored benchmark runs, the computed results and the Ask the Ledger page agree.
// Run: node --test pipelines/ledger-eval/ledger-benchmark-results.test.mjs
// Scoring every stored run again takes about 40 seconds, so CI scores only the smallest one here;
// `node pipelines/ledger-eval/build-results.mjs --check` scores them all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compact, root, scoreStored, sha256 } from './build-results.mjs';

const read = (p) => readFileSync(join(root, p), 'utf8');
const results = JSON.parse(read('data/ledger-eval/results.json'));
const manifest = JSON.parse(read('data/ledger-eval/runs.json'));
const page = read('src/content/lab/ask-the-ledger.md');
const runs = new Map(results.runs.map((r) => [r.githubRunNumber, r]));
const original = (r) => r.ledgers.original_seed_2027;
const question = (n, id) => runs.get(n).perQuestion.find((q) => q.id === id);

test('six runs are stored, complete, from the benchmark workflow, and match their recorded checksums', () => {
  assert.deepEqual(results.runs.map((r) => r.githubRunNumber), [3, 4, 5, 6, 7, 8]);
  assert.equal(manifest.runs.length, 6);
  for (const entry of manifest.runs) {
    const text = readFileSync(join(root, 'data/ledger-eval', entry.file));
    const run = JSON.parse(text);
    const r = runs.get(entry.githubRunNumber);
    assert.equal(run.kind, 'actual_cloudflare_rest_inference');
    assert.equal(run.status, 'complete');
    assert.equal(run.stopReason, 'suite_complete');
    assert.equal(r.runFileSha256, sha256(text), `${entry.file} changed since results.json was built`);
    assert.equal(r.artifactSha256, entry.artifactSha256);
    assert.match(entry.artifactSha256, /^[0-9a-f]{64}$/);
    assert.equal(entry.artifact, `ledger-eval-run-${entry.githubRunNumber}`);
    assert.equal(r.questions, run.records.length);
    assert.equal(r.questions, r.suite === 'legacy47' ? 47 : 20);
    assert.ok(run.records.every((x) => x.httpStatus === 200), 'every call returned HTTP 200');
  }
});

test('totals in results.json agree with the per-question verdicts', () => {
  for (const r of results.runs) {
    const o = original(r);
    const v = (i) => r.perQuestion.map((q) => q.verdicts[i]);
    assert.equal(r.rightOnAllFour, r.perQuestion.filter((q) => q.rightOnAllFour).length);
    assert.equal(o.figuresRight, v(0).filter((x) => x === 'correct_answer').length);
    assert.equal(o.declinedCorrectly, v(0).filter((x) => x === 'correct_refusal').length);
    assert.equal(o.declinedWrongly, v(0).filter((x) => x === 'wrongly_refused').length);
    assert.equal(o.right, o.figuresRight + o.declinedCorrectly);
    // Right on all four means right on each of the four ledgers.
    for (const q of r.perQuestion) {
      assert.equal(q.rightOnAllFour, q.verdicts.every((x) => x === 'correct_answer' || x === 'correct_refusal'), `${r.githubRunNumber} ${q.id}`);
    }
  }
});

test('scoring the smallest stored run again gives exactly the stored numbers', async () => {
  const entry = manifest.runs.find((e) => e.githubRunNumber === 8);
  const path = join(root, 'data/ledger-eval', entry.file);
  const again = compact(await scoreStored(path), entry, readFileSync(path));
  assert.deepEqual(again, runs.get(8));
});

// The six table rows, in the page's order, with the numbers the page must show.
const ROWS = [[3, '47 page questions · baseline · Qwen2.5-Coder 32B'], [4, '47 page questions · candidate · Qwen2.5-Coder 32B'], [5, '47 page questions · candidate · Llama 3.2 3B'],
  [6, '20 newer questions · baseline · Qwen2.5-Coder 32B'], [7, '20 newer questions · candidate · Qwen2.5-Coder 32B'], [8, '20 newer questions · candidate · Llama 3.2 3B']];

test('the benchmark table on the page shows the computed numbers, row by row', () => {
  const lines = page.split('\n').filter((l) => /^\| (47 page|20 newer) questions/.test(l));
  assert.equal(lines.length, 6);
  const of = (n, d) => `${n} of ${d}`;
  ROWS.forEach(([n, label], i) => {
    const r = runs.get(n);
    const o = original(r);
    const expected = [label, of(r.rightOnAllFour, r.questions), of(o.figuresRight, o.figuresAsked), of(o.declinedCorrectly, o.declinesAsked), String(o.declinedWrongly), r.usage.neurons.toLocaleString('en-US')];
    assert.deepEqual(lines[i].split('|').slice(1, -1).map((c) => c.trim()), expected, `row ${i + 1}`);
  });
});

test('the numbers quoted in the prose are the computed ones', () => {
  const total = results.runs.reduce((a, r) => a + r.usage.neurons, 0);
  assert.equal(total, 5197);
  assert.match(page, /The six runs used 5,197 neurons, about US\$0\.06 at list price/);
  assert.equal(Math.round(results.runs.reduce((a, r) => a + r.usage.listPriceUsd, 0) * 100) / 100, 0.06);
  // About 23 neurons a question for the live model and prompt; 50 questions is about 1,200.
  const perQuestion = runs.get(3).usage.neurons / 47;
  assert.equal(Math.round(perQuestion), 23);
  assert.equal(Math.round((perQuestion * 50) / 100) * 100, 1200);
  assert.match(page, /about 23 neurons a question/);
  assert.match(page, /would use about 1,200/);
  // Gains of the candidate prompt over the baseline.
  assert.equal(runs.get(4).rightOnAllFour - runs.get(3).rightOnAllFour, 4);
  assert.equal(runs.get(7).rightOnAllFour - runs.get(6).rightOnAllFour, 3);
  assert.match(page, /4 more questions right of 47, 3 more of 20/);
  // Declined wrongly: candidate 3 and 2, baseline 1 and 1.
  assert.deepEqual([4, 7, 3, 6].map((n) => original(runs.get(n)).declinedWrongly), [3, 2, 1, 1]);
  assert.match(page, /3 of 47 and 2 of 20, against 1 and 1 for the baseline/);
  // Qwen with the live prompt declined 6 of 13 and 6 of 10.
  assert.deepEqual([3, 6].map((n) => original(runs.get(n)).declinedCorrectly), [6, 6]);
});

test('each failure the page names is in the data as described', () => {
  const wrong = (n, id) => question(n, id).verdicts[0];
  // Six decline cases the candidate answered; 23 decline cases in all.
  for (const [n, id] of [[4, 'L35'], [4, 'L36'], [4, 'L37'], [4, 'L38'], [7, 'V11'], [7, 'V12']]) {
    assert.equal(question(n, id).want, 'refuse', `${id} should be a decline case`);
    assert.equal(wrong(n, id), 'wrong_answer', `${n} ${id}`);
  }
  assert.equal(original(runs.get(4)).declinesAsked + original(runs.get(7)).declinesAsked, 23);
  assert.equal(original(runs.get(4)).declinesAsked - original(runs.get(4)).declinedCorrectly + original(runs.get(7)).declinesAsked - original(runs.get(7)).declinedCorrectly, 6);
  // Missing year: baseline assumed 2025, candidate 2026.
  assert.match(question(3, 'L37').detail.sql, /2025-04/);
  assert.match(question(4, 'L37').detail.sql, /2026-04/);
  assert.match(question(3, 'L38').detail.sql, /2025-03/);
  assert.match(question(4, 'L38').detail.sql, /2026-03/);
  assert.match(question(6, 'V11').detail.sql, /2025-04/);
  assert.match(question(7, 'V11').detail.sql, /2026-04/);
  // A filter nobody asked for.
  const l03 = question(4, 'L03').detail;
  assert.match(l03.sql, /entity = 'North Hub'/);
  assert.deepEqual([l03.ledgers[0].got[0].value, l03.ledgers[0].want.value], [11169, 51147]);
  // The wrong period, in both Qwen prompts.
  for (const n of [3, 4]) {
    const d = question(n, 'L20').detail;
    assert.match(d.sql, /BETWEEN '2025-01' AND '2026-09'/);
    assert.deepEqual([Object.values(d.ledgers[0].got[0])[0], d.ledgers[0].want.value], [125394, 58488]);
  }
  // Divide by zero on the zero-revenue ledger.
  const v07 = question(7, 'V07');
  assert.deepEqual(v07.verdicts, ['correct_answer', 'correct_answer', 'wrong_answer', 'correct_answer']);
  assert.deepEqual([v07.detail.ledgers[1].ledger, v07.detail.ledgers[1].got[0].value, v07.detail.ledgers[1].want.value], ['zero_revenue', null, 0]);
  // Ties: right on three ledgers, wrong on the zero-revenue ledger only.
  for (const [n, id] of [[3, 'L13'], [4, 'L13'], [7, 'V08']]) {
    assert.deepEqual(question(n, id).verdicts, ['correct_answer', 'correct_answer', 'wrong_answer', 'correct_answer'], `${n} ${id}`);
    assert.equal(question(n, id).detail.ledgers[1].ledger, 'zero_revenue');
  }
});

test('Llama 3.2 3B numbers on the page', () => {
  const l = original(runs.get(5));
  assert.deepEqual([runs.get(5).rightOnAllFour, runs.get(8).rightOnAllFour], [1, 0]);
  assert.deepEqual([l.rejectedSql, l.queryErrorsOrTimeouts, l.modelErrors], [6, 7, 1]);
  assert.match(page, /Of the 47 queries it wrote, the validator rejected 6, 7 failed to run or timed out and 1 reply was a model error/);
  assert.ok(runs.get(5).responseMs.median < 700 && runs.get(8).responseMs.median < 700);
  assert.equal(runs.get(5).model, '@cf/meta/llama-3.2-3b-instruct');
});

test('the page no longer says that no model was scored, and My take is still empty', () => {
  assert.doesNotMatch(page, /No model has written SQL/i);
  assert.doesNotMatch(page, /No language model has been scored/i);
  assert.doesNotMatch(page, /has not been deployed or called/i);
  assert.doesNotMatch(page, /Neurons used per question have not been measured/i);
  assert.doesNotMatch(page, /model-scorecard-box/);
  assert.equal(page.slice(page.indexOf('## My take') + '## My take'.length).trim(), '');
  assert.match(page, /^dataFreshness: 2026-11-03$/m);
});

test('the page links to the data folder, and states what the numbers are not', () => {
  assert.match(page, /\[`data\/ledger-eval\/`\]\(https:\/\/github\.com\/felipealves7\/felipealveslab\/tree\/main\/data\/ledger-eval\)/);
  assert.match(page, /not comparable with these rows/);
  assert.match(page, /How much the answers change from run to run is not measured/);
  assert.match(page, /not from its meter/);
  assert.doesNotMatch(page, /production-ready|enterprise-grade|autonomous|state-of-the-art/i);
  assert.doesNotMatch(page, /claude\.ai\/code|session_[0-9A-Za-z]{8,}|Claude-Session/);
});
