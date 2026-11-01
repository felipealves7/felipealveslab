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

// ---------- chart geometry (SVG, built at build time) ----------
export function niceTicks(lo, hi, count = 4) {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { ticks, step };
}

// One metric by month: the earlier year as context, the latest year as the point.
export function lineChart(rows, key, opts = {}) {
  const { width = 720, height = 300, margin = { top: 18, right: 92, bottom: 30, left: 52 } } = opts;
  const years = [...new Set(rows.map((r) => r.year))].sort();
  const series = years.map((year) => ({
    year,
    points: rows.filter((r) => r.year === year).map((r) => ({ month: r.month, value: value(r, key) })).filter((p) => p.value !== null),
  }));
  const all = series.flatMap((s) => s.points.map((p) => p.value));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1;
  const { ticks, step } = niceTicks(lo - pad, hi + pad, 4);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const pw = width - margin.left - margin.right;
  const ph = height - margin.top - margin.bottom;
  const x = (month) => margin.left + ((month - 1) / 11) * pw;
  const y = (v) => margin.top + (1 - (v - y0) / (y1 - y0)) * ph;
  const r2 = (n) => Math.round(n * 100) / 100;
  const isPct = METRICS[key].unit === '%';
  const tickDigits = isPct ? Math.max(0, -Math.floor(Math.log10(step * 100) + 1e-9)) : Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const tickLabel = (v) => (isPct ? `${(v * 100).toFixed(tickDigits)}%` : `${v.toFixed(tickDigits)}`);
  const out = series.map((s) => ({
    year: s.year,
    d: s.points.map((p, i) => `${i ? 'L' : 'M'}${r2(x(p.month))},${r2(y(p.value))}`).join(''),
    points: s.points.map((p) => ({ month: p.month, value: p.value, text: fmtValue(key, p.value), cx: r2(x(p.month)), cy: r2(y(p.value)) })),
  }));
  const step2 = pw / 11;
  const columns = MONTHS.map((name, i) => ({
    month: i + 1,
    name,
    x: r2(x(i + 1)),
    x0: r2(Math.max(margin.left - step2 / 2, x(i + 1) - step2 / 2)),
    width: r2(step2),
    values: out.map((s) => {
      const p = s.points.find((q) => q.month === i + 1);
      return { year: s.year, text: p ? p.text : 'no data yet' };
    }),
  }));
  return {
    width, height, margin,
    plot: { left: margin.left, right: width - margin.right, top: margin.top, bottom: height - margin.bottom },
    yTicks: ticks.map((v) => ({ y: r2(y(v)), label: tickLabel(v) })),
    xTicks: MONTHS.map((name, i) => ({ x: r2(x(i + 1)), label: name })),
    series: out,
    columns,
  };
}

export function histogramChart(bins, opts = {}) {
  const { width = 720, height = 260, margin = { top: 16, right: 12, bottom: 54, left: 52 } } = opts;
  const pw = width - margin.left - margin.right;
  const ph = height - margin.top - margin.bottom;
  const slot = pw / bins.length;
  const bar = Math.min(24, slot - 4);
  const max = Math.max(...bins.map((b) => b.flights));
  const { ticks } = niceTicks(0, max, 4);
  const top = ticks[ticks.length - 1];
  const y = (v) => margin.top + (1 - v / top) * ph;
  const r2 = (n) => Math.round(n * 100) / 100;
  const compact = (v) => (v === 0 ? '0' : v >= 1e6 ? `${(v / 1e6).toFixed(Number.isInteger(v / 1e6) ? 0 : 1)}M` : `${Math.round(v / 1e3)}K`);
  const bars = bins.map((b, i) => {
    const cx = margin.left + slot * (i + 0.5);
    return {
      ...b,
      x: r2(cx - bar / 2), width: r2(bar), y: r2(y(b.flights)), height: r2(margin.top + ph - y(b.flights)),
      cx: r2(cx), slotX: r2(margin.left + slot * i), slotWidth: r2(slot),
      text: `${b.label}: ${fmtInt(b.flights)} flights, ${(b.share * 100).toFixed(1)}%`,
    };
  });
  const lateIdx = bins.findIndex((b) => b.start === 15);
  return {
    width, height, margin,
    plot: { left: margin.left, right: width - margin.right, top: margin.top, bottom: margin.top + ph },
    yTicks: ticks.map((v) => ({ y: r2(y(v)), label: compact(v) })),
    bars,
    boundaryX: r2(margin.left + slot * lateIdx),
  };
}
