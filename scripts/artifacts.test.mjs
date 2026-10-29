import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRng } from '../src/lib/artifacts/prng.mjs';
import {
  buildPayrollHistory,
  earliestDay,
  mostFrequentDay,
  evaluateRules,
  payrollIllustration,
} from '../src/lib/artifacts/payroll-rule.mjs';
import { buildRows, normalise, statusIllustration, STATES, MAPPINGS } from '../src/lib/artifacts/status-mapping.mjs';
import { buildJourneys, checkChain, custodyIllustration, scopeCut, CHECKPOINTS } from '../src/lib/artifacts/bag-custody.mjs';
import { scaledRanks, integratedScores, riskIllustration, buildParticipants, SIGNALS } from '../src/lib/artifacts/risk-signals.mjs';

// ---------- prng ----------
test('same seed gives the same sequence, different seed does not', () => {
  const a = makeRng(1);
  const b = makeRng(1);
  const c = makeRng(2);
  const seqA = [a.next(), a.next(), a.next()];
  assert.deepEqual(seqA, [b.next(), b.next(), b.next()]);
  assert.notDeepEqual(seqA, [c.next(), c.next(), c.next()]);
});

test('rng.int stays inside its bounds', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 1000; i++) {
    const n = rng.int(3, 6);
    assert.ok(n >= 3 && n <= 6);
  }
});

// ---------- payroll rule ----------
test('earliest picks the minimum, most frequent picks the mode', () => {
  assert.equal(earliestDay([25, 22, 25, 25, 24, 25]), 22);
  assert.equal(mostFrequentDay([25, 22, 25, 25, 24, 25]), 25);
});

test('most frequent breaks ties toward the most recent day', () => {
  assert.equal(mostFrequentDay([22, 25, 22, 25]), 25);
  assert.equal(mostFrequentDay([25, 22, 25, 22]), 22);
});

test('payroll history is deterministic and never pays after the contract day', () => {
  const a = buildPayrollHistory({ seed: 5 });
  const b = buildPayrollHistory({ seed: 5 });
  assert.deepEqual(a, b);
  for (const h of a) for (const d of h.paid) assert.ok(d <= h.contractDay && d >= h.contractDay - 8);
});

test('forecasts only use months before the one being forecast', () => {
  // Change the last month only. Every forecast except that month's own must stay the same.
  const base = [{ entity: 'X', contractDay: 20, paid: [20, 20, 20, 20, 20, 20, 20, 20] }];
  const changed = [{ entity: 'X', contractDay: 20, paid: [20, 20, 20, 20, 20, 20, 20, 1] }];
  const a = evaluateRules(base, 6);
  const b = evaluateRules(changed, 6);
  // 8 months with a window of 6 gives 2 scored months (index 6 and 7).
  assert.equal(a.frequent.n, 2);
  // Month 6 is forecast from months 0..5 in both cases, so only month 7's error can differ.
  assert.equal(a.frequent.mae, 0);
  assert.equal(b.frequent.mae, (0 + 19) / 2);
});

test('with no one-off early payments the frequent rule is not worse than the earliest rule', () => {
  const r = payrollIllustration({ oneOffEarlyProbability: 0 });
  assert.ok(r.evaluation.frequent.mae <= r.evaluation.earliest.mae);
});

test('with one-off early payments the frequent rule is clearly better on the default seed', () => {
  const r = payrollIllustration();
  assert.ok(r.evaluation.frequent.mae < r.evaluation.earliest.mae);
  assert.equal(r.sensitivity.length, 4);
});

// ---------- status mapping ----------
test('normalise trims and ignores case', () => {
  assert.deepEqual(normalise('spreadsheet', 'Done '), { state: 'complete', mapped: true });
  assert.deepEqual(normalise('testTool', 'NOT RUN'), { state: 'not_started', mapped: true });
});

test('unknown labels are reported as unmapped, not guessed', () => {
  assert.deepEqual(normalise('tracker', 'Parked'), { state: 'unclassified', mapped: false });
});

test('every label the generator can produce has a mapping', () => {
  const rows = buildRows({ seed: 1, applications: 500 });
  for (const r of rows) assert.equal(normalise(r.source, r.raw).mapped, true, `${r.source}: ${r.raw}`);
});

test('mappings only point at known states', () => {
  for (const table of Object.values(MAPPINGS)) for (const s of Object.values(table)) assert.ok(STATES.includes(s));
});

test('status counts add up to the number of applications and fewer labels remain after mapping', () => {
  const s = statusIllustration();
  assert.equal(Object.values(s.counts).reduce((a, b) => a + b, 0), s.applications);
  assert.ok(s.rawLabelCount > s.sharedStateCount);
  assert.equal(s.counts.unclassified, s.unclassified);
});

// ---------- bag custody ----------
test('checkChain classifies journeys', () => {
  assert.equal(checkChain([true, true, true, true]).status, 'complete');
  assert.deepEqual(checkChain([true, false, true, true]), { status: 'gap', gapAt: [1] });
  assert.equal(checkChain([false, true, true, true]).status, 'late_start');
  assert.equal(checkChain([true, true, false, false]).status, 'open_end');
  assert.equal(checkChain([false, false, false, false]).status, 'no_scans');
});

test('custody counts add up and gaps only appear at interior checkpoints', () => {
  const c = custodyIllustration({ bags: 2000 });
  assert.equal(Object.values(c.status).reduce((a, b) => a + b, 0), 2000);
  assert.equal(c.gapByCheckpoint[0].bags, 0);
  assert.equal(c.gapByCheckpoint[CHECKPOINTS.length - 1].bags, 0);
  assert.deepEqual(buildJourneys({ bags: 10 }), buildJourneys({ bags: 10 }));
});

test('scope cut follows the score and the cut-off', () => {
  const cut = scopeCut(undefined, 7);
  for (const c of cut) assert.equal(c.scope, c.score >= 7 ? 'MVP' : 'Horizon');
  const stricter = scopeCut(undefined, 11).filter((c) => c.scope === 'MVP').length;
  assert.ok(stricter < cut.filter((c) => c.scope === 'MVP').length);
});

// ---------- risk signals ----------
test('scaledRanks runs from 0 to 1 and shares ranks for ties', () => {
  assert.deepEqual(scaledRanks([1, 2, 3]), [0, 0.5, 1]);
  assert.deepEqual(scaledRanks([5, 5, 9]), [0.25, 0.25, 1]);
});

test('signal weights add up to 1', () => {
  assert.ok(Math.abs(SIGNALS.reduce((s, x) => s + x.weight, 0) - 1) < 1e-9);
});

test('integrated score stays between 0 and 1', () => {
  for (const r of integratedScores(buildParticipants())) assert.ok(r.score >= 0 && r.score <= 1);
});

test('risk illustration is deterministic and lists the right number of names', () => {
  const a = riskIllustration();
  const b = riskIllustration();
  assert.deepEqual(a, b);
  assert.equal(a.integrated.length, a.topN);
  for (const list of Object.values(a.perList)) assert.equal(list.length, a.topN);
});
