// Illustration for the cash-forecasting case study.
// Question: when a payroll forecast picks its date from past payments,
// does "earliest observed date" or "most frequent date" track reality better?
//
// All data is synthetic. It is not project data and it does not reproduce a project result.

import { makeRng } from './prng.mjs';

const WINDOW = 6; // months of history a rule may look at

/** Day of month on which a month's payroll is actually paid. Weekends move it earlier. */
function paidDay(year, monthIndex, contractDay, rng, oneOffEarlyProbability) {
  let day = contractDay;
  // Weekend rule: if the contract day is Saturday or Sunday, pay on the Friday before.
  const weekday = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
  if (weekday === 6) day -= 1;
  if (weekday === 0) day -= 2;
  // Occasional one-off early run (advance, correction, off-cycle). Three to six days early.
  if (rng.chance(oneOffEarlyProbability)) day -= rng.int(3, 6);
  return day;
}

/**
 * Build synthetic payroll history.
 * @returns {{entity:string, contractDay:number, paid:number[]}[]} paid[i] is the day of month in month i.
 */
export function buildPayrollHistory({ seed = 2026, entities = 6, months = 24, oneOffEarlyProbability = 0.12 } = {}) {
  const rng = makeRng(seed);
  const out = [];
  for (let e = 0; e < entities; e++) {
    const contractDay = rng.int(14, 28);
    const paid = [];
    for (let m = 0; m < months; m++) {
      const year = 2024 + Math.floor(m / 12);
      paid.push(paidDay(year, m % 12, contractDay, rng, oneOffEarlyProbability));
    }
    out.push({ entity: `Entity ${String.fromCharCode(65 + e)}`, contractDay, paid });
  }
  return out;
}

/** Rule A: the earliest day seen in the window. */
export function earliestDay(window) {
  return Math.min(...window);
}

/** Rule B: the day seen most often in the window. Ties go to the most recent of the tied days. */
export function mostFrequentDay(window) {
  const counts = new Map();
  const lastSeen = new Map();
  window.forEach((day, i) => {
    counts.set(day, (counts.get(day) ?? 0) + 1);
    lastSeen.set(day, i);
  });
  let best = null;
  for (const [day, n] of counts) {
    if (
      best === null ||
      n > counts.get(best) ||
      (n === counts.get(best) && lastSeen.get(day) > lastSeen.get(best))
    ) {
      best = day;
    }
  }
  return best;
}

/**
 * Walk forward through time. For each month, forecast with only the months before it.
 * Months before WINDOW have too little history and are skipped.
 */
export function evaluateRules(history, window = WINDOW) {
  const rules = {
    earliest: { label: 'Earliest observed date', pick: earliestDay },
    frequent: { label: 'Most frequent date', pick: mostFrequentDay },
  };
  /** @type {Record<'earliest' | 'frequent', { label: string, mae: number, exactShare: number, n: number, perEntity: { entity: string, mae: number }[] }>} */
  // @ts-ignore filled in the loop below, one entry per rule
  const result = {};
  for (const [key, rule] of /** @type {['earliest' | 'frequent', typeof rules.earliest][]} */ (Object.entries(rules))) {
    let absError = 0;
    let exact = 0;
    let n = 0;
    const perEntity = [];
    for (const h of history) {
      let entityAbs = 0;
      let entityN = 0;
      for (let m = window; m < h.paid.length; m++) {
        const forecast = rule.pick(h.paid.slice(m - window, m));
        const error = Math.abs(forecast - h.paid[m]);
        absError += error;
        entityAbs += error;
        if (error === 0) exact += 1;
        n += 1;
        entityN += 1;
      }
      perEntity.push({ entity: h.entity, mae: entityAbs / entityN });
    }
    result[key] = { label: rule.label, mae: absError / n, exactShare: exact / n, n, perEntity };
  }
  return result;
}

/** The result depends on how often one-off early payments happen, so show that dependence. */
export function sensitivity(probabilities = [0, 0.05, 0.12, 0.25], options = {}) {
  return probabilities.map((p) => {
    const evaluation = evaluateRules(buildPayrollHistory({ ...options, oneOffEarlyProbability: p }));
    return { probability: p, earliestMae: evaluation.earliest.mae, frequentMae: evaluation.frequent.mae };
  });
}

/** What the page shows. */
export function payrollIllustration(options) {
  const history = buildPayrollHistory(options);
  const evaluation = evaluateRules(history);
  return {
    history,
    evaluation,
    sensitivity: sensitivity(undefined, options),
    window: WINDOW,
    months: history[0].paid.length,
    oneOffEarlyProbability: options?.oneOffEarlyProbability ?? 0.12,
  };
}
