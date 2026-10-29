// Illustration for the risk-analytics case study.
// Question: what changes when three separate warning lists are combined into one ranking?
//
// All data is synthetic. "Participants" are invented market participants. The three signal types
// are generic (audit findings, security alerts, data-check failures). This does not reproduce the
// framework, its metrics, or the 32% figure on the case-study page.

import { makeRng } from './prng.mjs';

export const SIGNALS = [
  { key: 'audit', label: 'Audit findings', weight: 0.4 },
  { key: 'security', label: 'Security alerts', weight: 0.35 },
  { key: 'dataChecks', label: 'Data-check failures', weight: 0.25 },
];

export function buildParticipants({ seed = 32, participants = 24 } = {}) {
  const rng = makeRng(seed);
  const rows = [];
  for (let i = 1; i <= participants; i++) {
    // Each list is owned by a different team and looks at a different slice, so counts are independent.
    rows.push({
      name: `Participant ${String.fromCharCode(64 + i)}`,
      audit: rng.int(0, 6),
      security: rng.int(0, 9),
      dataChecks: rng.int(0, 14),
    });
  }
  return rows;
}

/** Rank of each value inside one signal, scaled to 0..1 (highest count = 1). Ties share the average rank. */
export function scaledRanks(values) {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(values.length);
  let k = 0;
  while (k < order.length) {
    let end = k;
    while (end + 1 < order.length && order[end + 1].v === order[k].v) end++;
    const avg = (k + end) / 2;
    for (let m = k; m <= end; m++) ranks[order[m].i] = avg;
    k = end + 1;
  }
  const max = values.length - 1;
  return ranks.map((r) => (max === 0 ? 0 : r / max));
}

export function integratedScores(rows, signals = SIGNALS) {
  const scaled = {};
  for (const s of signals) scaled[s.key] = scaledRanks(rows.map((r) => r[s.key]));
  return rows.map((r, i) => ({
    ...r,
    score: signals.reduce((sum, s) => sum + s.weight * scaled[s.key][i], 0),
  }));
}

const topNames = (rows, key, n) =>
  [...rows]
    .sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name))
    .slice(0, n)
    .map((r) => r.name);

export function riskIllustration(options, topN = 5) {
  const rows = buildParticipants(options);
  const scored = integratedScores(rows);
  const perList = Object.fromEntries(SIGNALS.map((s) => [s.key, topNames(rows, s.key, topN)]));
  const integrated = [...scored]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, topN);

  const onAnyList = new Set(Object.values(perList).flat());
  const appearances = (name) => SIGNALS.filter((s) => perList[s.key].includes(name)).length;
  const onMoreThanOne = [...onAnyList].filter((n) => appearances(n) > 1).length;
  // Participants the combined ranking puts in its top N although at most one single list does.
  const surfacedByCombining = integrated.filter((r) => appearances(r.name) <= 1).map((r) => r.name);

  return {
    participants: rows.length,
    topN,
    perList,
    integrated: integrated.map((r) => ({ name: r.name, score: r.score, lists: appearances(r.name) })),
    distinctOnLists: onAnyList.size,
    onMoreThanOne,
    surfacedByCombining,
  };
}
