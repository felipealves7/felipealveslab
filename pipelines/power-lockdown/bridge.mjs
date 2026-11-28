// The state-to-subsystem bridge. ONS publishes load by subsystem and OxCGRT publishes policy by
// state, so policy reaches load through weights: each state belongs to one subsystem, and its
// weight is its share of that subsystem. Weights sum to one in every subsystem.
//
// Both inputs are ONS tables:
// - membership: the subsystem that holds most of the state's substations in ONS's operating
//   network table (SUBESTACAO). A state whose substations sit in two subsystems goes to the one
//   with more of them; the split is recorded.
// - weights, two ways:
//   capacity: the state's share of its subsystem's transformer capacity (MVA) in the basic grid,
//             transformers in service on 1 March 2020 (CAPACIDADE_TRANSFORMACAO). A proxy for the
//             state's share of load, which ONS does not publish by state.
//   equal:    every state counts the same in its subsystem.
import { parseSemicolon, SUBSYSTEMS } from './load.mjs';

export const WEIGHTINGS = ['capacity', 'equal'];
export const CAPACITY_DATE = '2020-03-01';

/** Substations by state and subsystem. */
export function substationCounts(text) {
  const counts = new Map();
  for (const r of parseSemicolon(text).rows) {
    const k = `${r.id_estado}|${r.id_subsistema}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** Transformer capacity (MVA) in service on a date, by state and subsystem. */
export function capacityByState(text, on = CAPACITY_DATE) {
  const mva = new Map();
  for (const r of parseSemicolon(text).rows) {
    const start = r.dat_entradaoperacao.slice(0, 10);
    const end = r.dat_desativacao.slice(0, 10);
    if (!start || start > on || (end && end <= on)) continue;
    const k = `${r.id_estado}|${r.id_subsistema}`;
    mva.set(k, (mva.get(k) ?? 0) + Number(r.val_potencianominal_mva || 0));
  }
  return mva;
}

/**
 * The bridge: one row per state with its subsystem, its substations in and out of that subsystem,
 * its capacity and its two weights. `states` is the list of states that carry policy data.
 */
export function buildBridge(substationText, capacityText, states) {
  const counts = substationCounts(substationText);
  const mva = capacityByState(capacityText);
  const rows = [];
  for (const state of states) {
    const bySub = SUBSYSTEMS.map((s) => [s, counts.get(`${state}|${s}`) ?? 0]).sort((a, b) => b[1] - a[1]);
    if (bySub[0][1] === 0) throw new Error(`State ${state} has no substation in the ONS table`);
    if (bySub[1][1] === bySub[0][1]) throw new Error(`State ${state} is split evenly between ${bySub[0][0]} and ${bySub[1][0]}`);
    const subsystem = bySub[0][0];
    const total = bySub.reduce((a, [, n]) => a + n, 0);
    rows.push({ state, subsystem, substations: bySub[0][1], substations_elsewhere: total - bySub[0][1], mva: Math.round(mva.get(`${state}|${subsystem}`) ?? 0) });
  }
  for (const s of SUBSYSTEMS) {
    const members = rows.filter((r) => r.subsystem === s);
    const totalMva = members.reduce((a, r) => a + r.mva, 0);
    for (const r of members) {
      r.w_capacity = totalMva > 0 ? r.mva / totalMva : 1 / members.length;
      r.w_equal = 1 / members.length;
    }
  }
  return rows.sort((a, b) => a.subsystem.localeCompare(b.subsystem) || b.mva - a.mva);
}

/** Checks on the bridge: every state once, every subsystem covered, weights summing to one. */
export function bridgeChecks(bridge, states) {
  const seen = new Map();
  for (const r of bridge) seen.set(r.state, (seen.get(r.state) ?? 0) + 1);
  const checks = [
    { id: 'bridge.one_subsystem', says: 'Each state belongs to exactly one subsystem', failed: states.filter((s) => seen.get(s) !== 1).length },
    { id: 'bridge.covers', says: 'Each of the four subsystems has at least one state', failed: SUBSYSTEMS.filter((s) => !bridge.some((r) => r.subsystem === s)).length },
  ];
  for (const w of WEIGHTINGS) {
    const off = SUBSYSTEMS.filter((s) => Math.abs(bridge.filter((r) => r.subsystem === s).reduce((a, r) => a + r[`w_${w}`], 0) - 1) > 1e-9).length;
    checks.push({ id: `bridge.sum_${w}`, says: `The ${w} weights sum to one in every subsystem`, failed: off });
  }
  return checks;
}

/**
 * Weighted stringency by subsystem and day. A state with no value that day is left out and the
 * others are scaled up, so the weights used still sum to one; the result records how many were.
 */
export function subsystemStringency(bridge, policy, weighting) {
  const key = `w_${weighting}`;
  const byDay = new Map();
  for (const p of policy) {
    if (!byDay.has(p.date)) byDay.set(p.date, new Map());
    byDay.get(p.date).set(p.state, p.stringency);
  }
  const out = [];
  for (const [date, values] of [...byDay].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const s of SUBSYSTEMS) {
      let sum = 0;
      let wsum = 0;
      let used = 0;
      for (const r of bridge.filter((b) => b.subsystem === s)) {
        const v = values.get(r.state);
        if (!Number.isFinite(v)) continue;
        sum += r[key] * v;
        wsum += r[key];
        used += 1;
      }
      out.push({ subsystem: s, date, stringency: wsum > 0 ? sum / wsum : NaN, weight_used: wsum, states_used: used });
    }
  }
  return out;
}
