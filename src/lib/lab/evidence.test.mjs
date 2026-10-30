import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ledgerEvidence, airportEvidence } from './evidence.mjs';

const savedLedger = {
  synthetic: true, translator: 'keyword rules (not an LLM)',
  summary: { total: 4, correct_answer: 1, correct_refusal: 1, wrong_answer: 1, wrongly_refused: 1 },
  questions: [{}, {}, {}, {}],
};
const savedAirport = {
  synthetic: false, runs: [
    { deliberate: false, status: 'pass', runDate: '2026-10-29T08:15:50.497Z', rows: { airports: 100, runways: 20, countries: 4 }, checks: [{ id: 'a', says: 'a ok', passed: true, failed: 0 }, { id: 'b', says: 'b tolerated', passed: true, failed: 1 }] },
    { deliberate: true, status: 'fail', runDate: '2026-10-29T08:15:59.111Z', rows: { airports: 100, runways: 20, countries: 4 }, checks: [{ id: 'c', says: 'c bad', passed: false, failed: 100 }] },
  ],
};

test('Ledger chart measures saved rule translator outcomes, not a model score', () => {
  const result = ledgerEvidence(savedLedger);
  assert.equal(result.bars.reduce((sum, bar) => sum + bar.value, 0), 4);
  assert.match(result.summary, /not a model-accuracy score/);
  assert.deepEqual(result.bars.map((b) => b.percent), [25, 25, 25, 25]);
});
test('Ledger totals must reconcile', () => {
  assert.throws(() => ledgerEvidence({ ...savedLedger, summary: { ...savedLedger.summary, total: 5 } }), /do not match/);
});
test('Airport check strip excludes deliberate rehearsals and classifies each check', () => {
  const result = airportEvidence(savedAirport);
  assert.deepEqual(result.cells.map((c) => c.status), ['pass', 'tolerated']);
  assert.deepEqual(result.tally, { pass: 1, tolerated: 1, fail: 0 });
  assert.equal(result.rows.find((r) => r.key === 'airports').value, 100);
  assert.match(result.summary, /2 checks: 1 passed, 1 within a documented tolerance, 0 failed/);
});
test('Airport marks a failing check as fail', () => {
  const run = { ...savedAirport.runs[0], status: 'fail', checks: [{ id: 'x', says: 'x', passed: false, failed: 3 }] };
  assert.deepEqual(airportEvidence({ ...savedAirport, runs: [run] }).tally, { pass: 0, tolerated: 0, fail: 1 });
});
test('Singular wording is correct', () => {
  const one = { ...savedLedger, summary: { total: 1, correct_answer: 1, correct_refusal: 0, wrong_answer: 0, wrongly_refused: 0 }, questions: [{}] };
  assert.match(ledgerEvidence(one).summary, /1 correct outcome;/);
  const run = { ...savedAirport.runs[0], checks: [{ id: 'x', says: 'x', passed: true, failed: 0 }] };
  assert.match(airportEvidence({ ...savedAirport, runs: [run] }).summary, /1 check:/);
});
test('Airport requires non-rehearsal run', () => {
  assert.throws(() => airportEvidence({ ...savedAirport, runs: [savedAirport.runs[1]] }), /No saved non-rehearsal/);
});
