// Figures for /lab/aviation-reliability, computed when the site is built. Pure; no network.
//
// The inputs in data/aviation-reliability/ are byte-for-byte copies from the standalone project's
// package (aviation-reliability-v1, 30 Oct 2026). This module recomputes every figure the page shows
// from the monthly totals, and stops the build when they disagree with the saved analysis or with the
// totals counted straight from the original BTS files. Tested in scripts/aviation-page.test.mjs.
//
// Metric contract (metric-contract.json): add the counts first, divide last. Rates are never averaged.

const nf = new Intl.NumberFormat('en-GB');
const MINUS = '−';

export const ADDITIVE = ['scheduled', 'cancelled', 'diverted', 'observed_arrivals', 'on_time', 'delayed', 'unclassified', 'arrival_delay_sum', 'positive_delay_sum'];
const COUNTS = ADDITIVE.slice(0, 7);

export const METRICS = {
  mean_signed_delay: {
    label: 'Average arrival delay', short: 'Average delay', unit: 'min', num: 'arrival_delay_sum', den: 'observed_arrivals',
    definition: 'Average minutes late per flight that arrived. Early arrivals count as negative minutes.',
  },
  cancellation_rate: {
    label: 'Cancellation rate', short: 'Cancelled', unit: '%', num: 'cancelled', den: 'scheduled',
    definition: 'Cancelled flights as a share of all scheduled flights.',
  },
  scheduled_on_time_success: {
    label: 'On time, out of all scheduled flights', short: 'On time of all scheduled', unit: '%', num: 'on_time', den: 'scheduled',
    definition: 'Flights that arrived less than 15 minutes late, as a share of all scheduled flights. Cancelled and diverted flights count against it.',
  },
  arrival_otp: {
    label: 'On-time arrival rate', short: 'On time of arrivals', unit: '%', num: 'on_time', den: 'observed_arrivals',
    definition: 'Flights that arrived less than 15 minutes late, as a share of flights that arrived. Cancelled and diverted flights are left out.',
  },
  mean_positive_delay: {
    label: 'Average minutes late, early counted as zero', short: 'Minutes late', unit: 'min', num: 'positive_delay_sum', den: 'observed_arrivals',
    definition: 'Average minutes late per flight that arrived, with early arrivals counted as zero.',
  },
};
export const METRIC_ORDER = Object.keys(METRICS);

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------- formatting ----------
export const fmtInt = (n) => nf.format(n);
export const signed = (text, value) => (value < 0 ? MINUS + text : value > 0 ? '+' + text : text);
export function fmtValue(key, v, digits = 2) {
  if (v === null || v === undefined) return 'n/a';
  return METRICS[key].unit === '%' ? `${(v * 100).toFixed(digits)}%` : `${v.toFixed(digits)} min`;
}
// Change between two values of one metric: percentage points for rates, minutes for averages.
export function fmtChange(key, before, after, digits = 2) {
  const d = METRICS[key].unit === '%' ? (after - before) * 100 : after - before;
  const r = Number(Math.abs(d).toFixed(digits));
  const text = METRICS[key].unit === '%' ? `${r.toFixed(digits)} pts` : `${r.toFixed(digits)} min`;
  return r === 0 ? `no change at ${digits} decimals` : signed(text, d);
}
export function fmtRelative(before, after, digits = 1) {
  const pct = (after / before - 1) * 100;
  const r = Number(Math.abs(pct).toFixed(digits));
  return r === 0 ? '0%' : signed(`${r.toFixed(digits)}%`, pct);
}

// ---------- parsing and sums ----------
export function parseMonths(text) {
  const lines = String(text).trim().split(/\r?\n/);
  const head = lines[0].split(',');
  for (const k of ['source_period', 'year', 'month', ...ADDITIVE]) {
    if (!head.includes(k)) throw new Error(`Monthly totals lack the column ${k}`);
  }
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',');
    if (cells.length !== head.length) throw new Error('Monthly totals have a malformed row');
    const r = Object.fromEntries(head.map((h, i) => [h, h === 'source_period' ? cells[i] : Number(cells[i])]));
    for (const k of ['year', 'month', ...COUNTS]) {
      if (!Number.isSafeInteger(r[k]) || r[k] < 0) throw new Error(`Invalid ${k} in ${r.source_period}`);
    }
    for (const k of ['arrival_delay_sum', 'positive_delay_sum']) {
      if (!Number.isFinite(r[k])) throw new Error(`Invalid ${k} in ${r.source_period}`);
    }
    if (r.source_period !== `${r.year}-${String(r.month).padStart(2, '0')}`) throw new Error(`Period label does not match ${r.source_period}`);
    if (r.scheduled !== r.cancelled + r.diverted + r.observed_arrivals + r.unclassified) throw new Error(`Flights do not add up in ${r.source_period}`);
    if (r.observed_arrivals !== r.on_time + r.delayed) throw new Error(`Arrivals do not add up in ${r.source_period}`);
    return r;
  });
  const periods = new Set(rows.map((r) => r.source_period));
  if (periods.size !== rows.length) throw new Error('A month appears twice in the monthly totals');
  return rows.sort((a, b) => a.source_period.localeCompare(b.source_period));
}

export function sum(rows) {
  const t = Object.fromEntries(ADDITIVE.map((k) => [k, 0]));
  for (const r of rows) for (const k of ADDITIVE) t[k] += r[k];
  return t;
}

// A rate or average from summed totals; null when nothing is in the denominator.
export function value(totals, key) {
  const m = METRICS[key];
  return totals[m.den] > 0 ? totals[m.num] / totals[m.den] : null;
}

export function overview(rows) {
  const t = sum(rows);
  return {
    flights: t.scheduled,
    months: rows.length,
    from: rows[0].source_period,
    to: rows[rows.length - 1].source_period,
    observed: t.observed_arrivals,
  };
}

// The latest year against the year before, over the months both have.
export function matched(rows) {
  const latest = Math.max(...rows.map((r) => r.year));
  const prior = latest - 1;
  const monthsOf = (y) => new Set(rows.filter((r) => r.year === y).map((r) => r.month));
  const a = monthsOf(prior);
  const months = [...monthsOf(latest)].filter((m) => a.has(m)).sort((x, y) => x - y);
  if (!months.length) throw new Error('No months shared by the last two years');
  const pick = (y) => sum(rows.filter((r) => r.year === y && months.includes(r.month)));
  const before = pick(prior);
  const after = pick(latest);
  const metrics = METRIC_ORDER.map((key) => ({
    key,
    label: METRICS[key].label,
    short: METRICS[key].short,
    definition: METRICS[key].definition,
    before: value(before, key),
    after: value(after, key),
  }));
  return { years: [prior, latest], months, before, after, metrics };
}

export function monthSpan(months) {
  return months.length > 1 ? `${MONTHS[months[0] - 1]}–${MONTHS[months[months.length - 1] - 1]}` : MONTHS[months[0] - 1];
}

// The saved analysis (cached-results.json) reports January to August of each year. Every count must match.
export function checkAgainstSaved(m, saved) {
  if (m.months.join(',') !== '1,2,3,4,5,6,7,8') throw new Error('The matched months changed; the saved analysis covers January to August only');
  const [y0, y1] = m.years;
  for (const [y, totals] of [[y0, m.before], [y1, m.after]]) {
    const s = saved[`jan_aug_${y}`];
    if (!s) throw new Error(`The saved analysis has no January to August ${y}`);
    for (const k of ADDITIVE) {
      if (Math.abs(totals[k] - s[k]) > 1e-6) throw new Error(`Monthly totals disagree with the saved analysis: ${k}, ${y}`);
    }
    for (const key of METRIC_ORDER) {
      if (Math.abs(value(totals, key) - s[key]) > 1e-12) throw new Error(`Recomputed ${key} disagrees with the saved analysis, ${y}`);
    }
  }
  return true;
}

// Compare every month and measure with the totals counted straight from the original BTS CSV files.
export function reconcile(rows, independent) {
  const byPeriod = new Map(independent.map((r) => [r.period, r]));
  let comparisons = 0;
  const mismatches = [];
  for (const r of rows) {
    const ref = byPeriod.get(r.source_period);
    if (!ref) { mismatches.push(`${r.source_period}: no independent count`); continue; }
    for (const k of ADDITIVE) {
      comparisons += 1;
      if (Math.abs(r[k] - ref[k]) > 1e-6) mismatches.push(`${r.source_period}: ${k}`);
    }
  }
  if (byPeriod.size !== rows.length) mismatches.push('The independent counts cover different months');
  return { comparisons, matched: comparisons - mismatches.length, mismatches };
}

// ---------- the headline ----------
export function headline(m) {
  const get = (k) => m.metrics.find((x) => x.key === k);
  const delay = get('mean_signed_delay');
  const canc = get('cancellation_rate');
  const succ = get('scheduled_on_time_success');
  const span = monthSpan(m.months);
  return {
    span,
    delayBefore: fmtValue('mean_signed_delay', delay.before),
    delayAfter: fmtValue('mean_signed_delay', delay.after),
    delayChange: fmtChange('mean_signed_delay', delay.before, delay.after),
    cancBefore: fmtValue('cancellation_rate', canc.before),
    cancAfter: fmtValue('cancellation_rate', canc.after),
    cancRelative: fmtRelative(canc.before, canc.after, 0),
    succChange: fmtChange('scheduled_on_time_success', succ.before, succ.after),
  };
}

// Compact Lab card: each measure in the latest year as a % change from the year before.
export function changeBars(m) {
  const rows = m.metrics.map((x) => ({ key: x.key, label: x.short, change: (x.after / x.before - 1) * 100, text: fmtRelative(x.before, x.after) }));
  const max = Math.max(...rows.map((r) => Math.abs(r.change)));
  return rows.map((r) => ({ ...r, percent: max ? (r.change / max) * 100 : 0 }));
}

// ---------- delay distribution ----------
export function parseHistogram(text) {
  const lines = String(text).trim().split(/\r?\n/);
  if (lines[0] !== 'bin_start,flights') throw new Error('Unexpected histogram header');
  const bins = lines.slice(1).map((l) => {
    const [s, f] = l.split(',').map(Number);
    if (!Number.isFinite(s) || !Number.isSafeInteger(f) || f < 0) throw new Error('Invalid histogram row');
    return { start: s, flights: f };
  }).sort((a, b) => a.start - b.start);
  // export_analyze.py: below -30 minutes goes to -60, 180 and above goes to 180, else 15-minute bins.
  const expected = [-60, ...Array.from({ length: 15 }, (_, i) => -30 + 15 * i)];
  if (bins.map((b) => b.start).join(',') !== expected.join(',')) throw new Error('Histogram bins are not the expected 15-minute bins');
  const total = bins.reduce((n, b) => n + b.flights, 0);
  return bins.map((b) => ({ ...b, share: b.flights / total, label: binLabel(b.start), late: b.start >= 15 }));
}

export function binLabel(start) {
  if (start === -60) return 'More than 30 min early';
  if (start === 180) return '180 min or more late';
  if (start < 0) return `${-start - 14}–${-start} min early`;
  if (start === 0) return 'On time to 14 min late';
  return `${start}–${start + 14} min late`;
}
