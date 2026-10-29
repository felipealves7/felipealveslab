// Illustration for the aviation case study.
// Question: how does a custody-chain check turn "a bag went missing" into "the chain broke
// between these two checkpoints"?
//
// All data is synthetic. The four checkpoints are generic stages of a bag's journey, chosen
// for this illustration. They are not copied from any standard or any airport system, and
// no operational data, volumes or rules from any employer are used.

import { makeRng } from './prng.mjs';

export const CHECKPOINTS = ['Check-in', 'Loaded on aircraft', 'Transfer area', 'Arrival hall'];

// Chance that a scan is missing at each checkpoint (synthetic, picked so the output is readable).
const MISSING_SCAN_PROBABILITY = [0.004, 0.012, 0.02, 0.006];

/** Build synthetic bag journeys. scans[i] is true when checkpoint i recorded the bag. */
export function buildJourneys({ seed = 753, bags = 5000 } = {}) {
  const rng = makeRng(seed);
  const journeys = [];
  for (let i = 0; i < bags; i++) {
    journeys.push({
      id: i + 1,
      scans: CHECKPOINTS.map((_, c) => !rng.chance(MISSING_SCAN_PROBABILITY[c])),
    });
  }
  return journeys;
}

/**
 * Check one journey.
 * "gap" means a checkpoint with no scan between two scans (the chain is broken there).
 * A bag with no scans after its last scan has an open end: it may simply still be travelling.
 */
export function checkChain(scans) {
  const first = scans.indexOf(true);
  const last = scans.lastIndexOf(true);
  if (first === -1) return { status: 'no_scans', gapAt: [] };
  const gapAt = [];
  for (let i = first; i <= last; i++) if (!scans[i]) gapAt.push(i);
  if (gapAt.length > 0) return { status: 'gap', gapAt };
  if (first > 0) return { status: 'late_start', gapAt: [] };
  if (last < scans.length - 1) return { status: 'open_end', gapAt: [] };
  return { status: 'complete', gapAt: [] };
}

export function custodyIllustration(options) {
  const journeys = buildJourneys(options);
  const status = { complete: 0, gap: 0, late_start: 0, open_end: 0, no_scans: 0 };
  const gapByCheckpoint = CHECKPOINTS.map(() => 0);
  for (const j of journeys) {
    const r = checkChain(j.scans);
    status[r.status] += 1;
    r.gapAt.forEach((c) => (gapByCheckpoint[c] += 1));
  }
  return {
    bags: journeys.length,
    status,
    gapByCheckpoint: CHECKPOINTS.map((name, i) => ({ checkpoint: name, bags: gapByCheckpoint[i] })),
    needReview: status.gap + status.late_start + status.no_scans,
  };
}

// A second, deliberately small illustration: how a scoping rule can separate "MVP" from "horizon".
// Scores are invented for this page. They are not the real feature list or the real scores.
export const CANDIDATE_CAPABILITIES = [
  { name: 'Match each bag to its flight', criticality: 5, dependants: 4, reversible: false },
  { name: 'Flag a bag with no match', criticality: 5, dependants: 3, reversible: false },
  { name: 'Record every custody handover', criticality: 4, dependants: 4, reversible: false },
  { name: 'Audit trail for every change', criticality: 4, dependants: 3, reversible: false },
  { name: 'Shift-level exception list', criticality: 3, dependants: 2, reversible: true },
  { name: 'Self-service reports', criticality: 2, dependants: 1, reversible: true },
  { name: 'Mishandling prediction', criticality: 2, dependants: 1, reversible: true },
  { name: 'Cross-airline analytics', criticality: 1, dependants: 1, reversible: true },
];

/** Score = criticality + dependants, plus 2 when the capability is hard to add later. MVP cut-off is a parameter. */
export function scopeCut(capabilities = CANDIDATE_CAPABILITIES, cutOff = 7) {
  return capabilities
    .map((c) => {
      const score = c.criticality + c.dependants + (c.reversible ? 0 : 2);
      return { ...c, score, scope: score >= cutOff ? 'MVP' : 'Horizon' };
    })
    .sort((a, b) => b.score - a.score);
}
