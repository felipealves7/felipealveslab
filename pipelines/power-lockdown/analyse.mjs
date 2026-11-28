// The lockdown and power-load lab: reads the files fetch.mjs saved, runs every check, builds the
// bridge and the calendar, and writes data/power-lockdown/results.json and the tidy tables in
// data/power-lockdown/ that the semantic layer reads.
//
// Usage: node pipelines/power-lockdown/analyse.mjs
//
// Every comparison is against the weekday-aligned days of 2018 and 2019 (364 and 728 days
// earlier), and only between ordinary days (see calendar.mjs). Months and quarters are calendar
// periods set against the same months of 2018 and 2019, as monthly statistics are reported.
import { readFileSync, writeFileSync } from 'node:fs';
import { calendar, comparable, referenceDays, isoWeek, dayNumber, isoDay } from './calendar.mjs';
import { readHourly, readStringency, readSgs, SUBSYSTEMS, SUBSYSTEM_NAMES } from './load.mjs';
import { buildBridge, bridgeChecks, subsystemStringency, WEIGHTINGS } from './bridge.mjs';

const DATA = new URL('../../data/power-lockdown/', import.meta.url);
const RAW = new URL('raw/', DATA);
const read = (p) => readFileSync(new URL(p, RAW), 'utf8');

export const YEARS = [2018, 2019, 2020, 2021];
export const PRE = { from: '2020-01-06', to: '2020-03-13' }; // before the first state decrees
export const SHOCK = { from: '2020-03-16', to: '2020-06-30' }; // the estimation window, March to June
export const CHART = { from: '2020-03-01', to: '2020-07-31' };
export const BOOT = { reps: 2000, seed: 20200316 };

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round = (x, d = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const pct = (ratio) => round(100 * (ratio - 1), 2);

/** Daily energy (MWh) by subsystem: the sum of the 24 hourly values. A day with a zero or empty hour is dropped. */
export function dailyLoad(hourly) {
  const days = new Map();
  for (const r of hourly) {
    const k = `${r.subsystem}|${r.date}`;
    if (!days.has(k)) days.set(k, { subsystem: r.subsystem, date: r.date, mwh: 0, hours: 0, zero: 0 });
    const d = days.get(k);
    d.mwh += r.mw;
    d.hours += 1;
    if (!(r.mw > 0)) d.zero += 1; // zero, or the empty hour of a clock change
  }
  return [...days.values()].filter((d) => d.hours === 24 && d.zero === 0);
}

/** Index of a value by subsystem and date. Brazil ('BR') is the sum of the four when all are present. */
export function indexLoad(daily) {
  const idx = new Map();
  for (const d of daily) idx.set(`${d.subsystem}|${d.date}`, d.mwh);
  const dates = new Set(daily.map((d) => d.date));
  for (const date of dates) {
    const vals = SUBSYSTEMS.map((s) => idx.get(`${s}|${date}`));
    if (vals.every(Number.isFinite)) idx.set(`BR|${date}`, vals.reduce((a, b) => a + b, 0));
  }
  return idx;
}

/** A day's load against the mean of its two reference days, or null if not comparable. */
export function dayRatio(idx, area, date) {
  if (!comparable(date)) return null;
  const v = idx.get(`${area}|${date}`);
  const refs = referenceDays(date).map((d) => idx.get(`${area}|${d}`));
  if (!Number.isFinite(v) || !refs.every(Number.isFinite)) return null;
  return v / mean(refs);
}

/** Ratio of summed load to summed reference load over the comparable days in a range. */
export function rangeRatio(idx, area, from, to) {
  let num = 0;
  let den = 0;
  let n = 0;
  for (let k = dayNumber(from); k <= dayNumber(to); k += 1) {
    const date = isoDay(k);
    if (dayRatio(idx, area, date) === null) continue;
    num += idx.get(`${area}|${date}`);
    den += mean(referenceDays(date).map((d) => idx.get(`${area}|${d}`)));
    n += 1;
  }
  return { ratio: n ? num / den : null, days: n };
}

/** The deepest fall at each level of detail, for one area, inside a window. */
export function levels(hourly, idx, area, window) {
  // Hours: each hour of a comparable day against the same hour of its two reference days.
  const hourIdx = new Map();
  for (const r of hourly) {
    const k = `${r.date}|${r.hour}`;
    if (area === 'BR' || r.subsystem === area) hourIdx.set(k, (hourIdx.get(k) ?? 0) + r.mw);
  }
  let hour = { ratio: Infinity };
  let hoursSeen = 0;
  for (let k = dayNumber(window.from); k <= dayNumber(window.to); k += 1) {
    const date = isoDay(k);
    if (dayRatio(idx, area, date) === null) continue;
    for (let h = 0; h < 24; h += 1) {
      const v = hourIdx.get(`${date}|${h}`);
      const refs = referenceDays(date).map((d) => hourIdx.get(`${d}|${h}`));
      if (!Number.isFinite(v) || !refs.every(Number.isFinite)) continue;
      hoursSeen += 1;
      const ratio = v / mean(refs);
      if (ratio < hour.ratio) hour = { ratio, date, hour: h };
    }
  }
  // Days.
  let day = { ratio: Infinity };
  let daysSeen = 0;
  for (let k = dayNumber(window.from); k <= dayNumber(window.to); k += 1) {
    const date = isoDay(k);
    const ratio = dayRatio(idx, area, date);
    if (ratio === null) continue;
    daysSeen += 1;
    if (ratio < day.ratio) day = { ratio, date };
  }
  // ISO weeks with at least five comparable days, all inside the window.
  const weeks = new Map();
  for (let k = dayNumber(window.from); k <= dayNumber(window.to); k += 1) {
    const date = isoDay(k);
    const w = isoWeek(date);
    if (!weeks.has(w)) weeks.set(w, { from: date, to: date });
    weeks.get(w).to = date;
  }
  let week = { ratio: Infinity };
  let weeksSeen = 0;
  for (const [w, r] of weeks) {
    const res = rangeRatio(idx, area, r.from, r.to);
    if (res.days < 5) continue;
    weeksSeen += 1;
    if (res.ratio < week.ratio) week = { ratio: res.ratio, week: w, from: r.from, to: r.to, days: res.days };
  }
  // Calendar months and quarters, all days, against the same months of 2018 and 2019.
  const total = (from, to) => {
    let s = 0;
    for (let k = dayNumber(from); k <= dayNumber(to); k += 1) {
      const v = idx.get(`${area}|${isoDay(k)}`);
      if (!Number.isFinite(v)) return NaN;
      s += v;
    }
    return s;
  };
  const periodRatio = (y, m0, m1) => {
    const span = (yy) => [`${yy}-${String(m0).padStart(2, '0')}-01`, isoDay(dayNumber(`${m1 === 12 ? yy + 1 : yy}-${String(m1 === 12 ? 1 : m1 + 1).padStart(2, '0')}-01`) - 1)];
    return total(...span(y)) / mean([total(...span(y - 1)), total(...span(y - 2))]);
  };
  let month = { ratio: Infinity };
  const m0 = +window.from.slice(5, 7);
  const m1 = +window.to.slice(5, 7);
  for (let m = m0; m <= m1; m += 1) {
    const ratio = periodRatio(2020, m, m);
    if (ratio < month.ratio) month = { ratio, month: `2020-${String(m).padStart(2, '0')}` };
  }
  const quarter = { ratio: periodRatio(2020, 4, 6), quarter: '2020-Q2' };
  const whole = rangeRatio(idx, area, window.from, window.to);
  return {
    hour: { ...hour, fall_pct: pct(hour.ratio), ratio: round(hour.ratio), of: hoursSeen },
    day: { ...day, fall_pct: pct(day.ratio), ratio: round(day.ratio), of: daysSeen },
    week: { ...week, fall_pct: pct(week.ratio), ratio: round(week.ratio), of: weeksSeen },
    month: { ...month, fall_pct: pct(month.ratio), ratio: round(month.ratio), of: m1 - m0 + 1 },
    quarter: { ...quarter, fall_pct: pct(quarter.ratio), ratio: round(quarter.ratio), of: 1 },
    window: { from: window.from, to: window.to, fall_pct: pct(whole.ratio), ratio: round(whole.ratio), days: whole.days },
  };
}

/** The same month and quarter comparisons for IBC-Br, and the seasonally adjusted change. */
export function activity(nsa, sa) {
  const v = (rows, m) => rows.find((r) => r.month === m)?.value;
  const same = (m) => v(nsa, `2020-${m}`) / mean([v(nsa, `2019-${m}`), v(nsa, `2018-${m}`)]);
  const months = ['03', '04', '05', '06'].map((m) => ({ month: `2020-${m}`, ratio: round(same(m)), fall_pct: pct(same(m)) }));
  const q = (y) => mean(['04', '05', '06'].map((m) => v(nsa, `${y}-${m}`)));
  const qRatio = q(2020) / mean([q(2019), q(2018)]);
  const deepest = months.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  return {
    months,
    deepest_month: deepest,
    quarter: { quarter: '2020-Q2', ratio: round(qRatio), fall_pct: pct(qRatio), note: 'mean of the three months' },
    sa_feb_to_apr_pct: pct(v(sa, '2020-04') / v(sa, '2020-02')),
  };
}

// A small seeded generator, so the bootstrap gives the same interval on every run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Least-squares slope of y on x after removing subsystem means, and optionally day means too. */
export function slope(panel, { dayEffects }) {
  // panel: [{ unit, day, x, y }]; with day effects the panel must hold every unit on every day.
  const by = (key) => {
    const m = new Map();
    for (const r of panel) {
      const k = r[key];
      if (!m.has(k)) m.set(k, { x: 0, y: 0, n: 0 });
      const e = m.get(k);
      e.x += r.x;
      e.y += r.y;
      e.n += 1;
    }
    for (const e of m.values()) { e.x /= e.n; e.y /= e.n; }
    return m;
  };
  const units = by('unit');
  const days = dayEffects ? by('day') : null;
  const gx = mean(panel.map((r) => r.x));
  const gy = mean(panel.map((r) => r.y));
  let sxy = 0;
  let sxx = 0;
  for (const r of panel) {
    let x = r.x - units.get(r.unit).x;
    let y = r.y - units.get(r.unit).y;
    if (dayEffects) {
      x += gx - days.get(r.day).x;
      y += gy - days.get(r.day).y;
    }
    sxy += x * y;
    sxx += x * x;
  }
  return sxy / sxx;
}

/** Resample whole weeks with replacement; returns the 2.5th and 97.5th percentiles of the slope. */
export function bootstrap(panel, opts, { reps, seed }) {
  const weeks = new Map();
  for (const r of panel) {
    if (!weeks.has(r.week)) weeks.set(r.week, []);
    weeks.get(r.week).push(r);
  }
  const keys = [...weeks.keys()];
  const rand = mulberry32(seed);
  const out = [];
  for (let i = 0; i < reps; i += 1) {
    const sample = [];
    for (let j = 0; j < keys.length; j += 1) {
      const w = keys[Math.floor(rand() * keys.length)];
      // Each draw is its own block, so a week drawn twice counts as two sets of days.
      for (const r of weeks.get(w)) sample.push({ ...r, day: `${r.day}#${j}` });
    }
    out.push(slope(sample, opts));
  }
  out.sort((a, b) => a - b);
  return [out[Math.floor(0.025 * reps)], out[Math.ceil(0.975 * reps) - 1]];
}

/**
 * The dose estimate: change in load, in per cent, per 10 points of weighted stringency.
 * y is the log of a day's load against its reference days, less the subsystem's mean before the
 * decrees (PRE), so a subsystem that was growing faster than the others does not count as a dose.
 */
export function dosePanel(idx, stringency, from, to) {
  const s = new Map(stringency.map((r) => [`${r.subsystem}|${r.date}`, r.stringency]));
  const pre = {};
  for (const sub of SUBSYSTEMS) {
    const ys = [];
    for (let k = dayNumber(PRE.from); k <= dayNumber(PRE.to); k += 1) {
      const r = dayRatio(idx, sub, isoDay(k));
      if (r !== null) ys.push(Math.log(r));
    }
    pre[sub] = mean(ys);
  }
  const panel = [];
  for (let k = dayNumber(from); k <= dayNumber(to); k += 1) {
    const date = isoDay(k);
    const rows = SUBSYSTEMS.map((sub) => ({ sub, r: dayRatio(idx, sub, date), x: s.get(`${sub}|${date}`) }));
    if (!rows.every((e) => e.r !== null && Number.isFinite(e.x))) continue; // balanced panel only
    for (const e of rows) panel.push({ unit: e.sub, day: date, week: isoWeek(date), x: e.x / 10, y: Math.log(e.r) - pre[e.sub] });
  }
  return { panel, pre };
}

const asPct = (b) => round(100 * (Math.exp(b) - 1), 2);

export function estimates(idx, stringency) {
  const { panel, pre } = dosePanel(idx, stringency, PRE.from, SHOCK.to);
  const shockOnly = panel.filter((r) => r.day >= SHOCK.from);
  const run = (rows, dayEffects) => {
    const b = slope(rows, { dayEffects });
    const [lo, hi] = bootstrap(rows, { dayEffects }, BOOT);
    return { per10_pct: asPct(b), low_pct: asPct(lo), high_pct: asPct(hi), days: rows.length / SUBSYSTEMS.length, weeks: new Set(rows.map((r) => r.week)).size };
  };
  return {
    pre_growth_pct: Object.fromEntries(SUBSYSTEMS.map((s) => [s, asPct(pre[s])])),
    over_time: { ...run(panel, false), sample: `${PRE.from} to ${SHOCK.to}`, says: 'Subsystem effects only: compares each subsystem with itself as stringency rose and fell, so it also carries everything else that changed nationally on those days.' },
    same_day: { ...run(shockOnly, true), sample: `${SHOCK.from} to ${SHOCK.to}`, says: 'Subsystem and day effects: compares subsystems with each other on the same day, so national shocks cancel and only differences in stringency between subsystems are left.' },
  };
}

function csv(rows, cols) {
  return [cols.join(','), ...rows.map((r) => cols.map((c) => (r[c] === null || r[c] === undefined ? '' : r[c])).join(','))].join('\n') + '\n';
}

/** Everything, from the saved raw files: the results and the tidy tables, nothing written. */
export function compute() {
  const checks = [];
  const hourly = [];
  for (const y of YEARS) {
    const res = readHourly(read(`ons/CURVA_CARGA_${y}.csv`), y);
    checks.push(...res.checks);
    hourly.push(...res.rows);
  }
  const policy = readStringency(read('oxcgrt/brazil-states-2020-2021.csv'));
  checks.push(...policy.checks);
  const nsa = readSgs(read('bcb/ibcbr-24363.json'), 24363);
  const sa = readSgs(read('bcb/ibcbr-24364.json'), 24364);
  checks.push(...nsa.checks, ...sa.checks);

  const states = [...new Set(policy.rows.map((r) => r.state))].sort();
  const bridge = buildBridge(read('ons/SUBESTACAO.csv'), read('ons/CAPACIDADE_TRANSFORMACAO.csv'), states);
  checks.push(...bridgeChecks(bridge, states));

  const stringency = Object.fromEntries(WEIGHTINGS.map((w) => [w, subsystemStringency(bridge, policy.rows, w)]));
  const offDays = stringency.capacity.filter((r) => Math.abs(r.weight_used - 1) > 1e-9).length;
  checks.push({ id: 'bridge.daily_weights', says: 'On every day, the weights of the states with a stringency value sum to one in each subsystem', failed: offDays });

  const daily = dailyLoad(hourly);
  const idx = indexLoad(daily);
  // No load is counted twice: Brazil's daily total equals the sum of all hourly values on that day.
  const hourSum = new Map();
  for (const r of hourly) if (Number.isFinite(r.mw)) hourSum.set(r.date, (hourSum.get(r.date) ?? 0) + r.mw);
  const doubled = [...hourSum].filter(([d, v]) => idx.has(`BR|${d}`) && Math.abs(idx.get(`BR|${d}`) - v) > 1e-6).length;
  checks.push({ id: 'load.no_double_count', says: "Brazil's daily load equals the sum of every subsystem's hourly values that day", failed: doubled });

  const failed = checks.filter((c) => c.failed > 0);
  if (failed.length) throw new Error(`Checks failed: ${failed.map((c) => `${c.id} (${c.failed})`).join(', ')}`);

  const areas = ['BR', ...SUBSYSTEMS];
  const lod = Object.fromEntries(areas.map((a) => [a, levels(hourly, idx, a, SHOCK)]));
  const pre = Object.fromEntries(areas.map((a) => [a, pct(rangeRatio(idx, a, PRE.from, PRE.to).ratio)]));

  // April 2020 by subsystem: the mean weighted stringency and the fall in load.
  const april = SUBSYSTEMS.map((s) => {
    const st = stringency.capacity.filter((r) => r.subsystem === s && r.date.startsWith('2020-04'));
    return {
      subsystem: s,
      name: SUBSYSTEM_NAMES[s],
      stringency_capacity: round(mean(st.map((r) => r.stringency)), 1),
      stringency_equal: round(mean(stringency.equal.filter((r) => r.subsystem === s && r.date.startsWith('2020-04')).map((r) => r.stringency)), 1),
      load_fall_pct: pct(rangeRatio(idx, s, '2020-04-01', '2020-04-30').ratio),
      comparable_days: rangeRatio(idx, s, '2020-04-01', '2020-04-30').days,
    };
  });

  // How much the dose varied: the gap between the strictest and the mildest subsystem on each day
  // of the window, and the range across states in April.
  const spread = (w) => {
    const gaps = [];
    for (let k = dayNumber(SHOCK.from); k <= dayNumber(SHOCK.to); k += 1) {
      const date = isoDay(k);
      const v = stringency[w].filter((r) => r.date === date).map((r) => r.stringency);
      gaps.push(Math.max(...v) - Math.min(...v));
    }
    return { mean_gap: round(mean(gaps), 1), max_gap: round(Math.max(...gaps), 1) };
  };
  const aprilStates = states.map((st) => ({ state: st, stringency: round(mean(policy.rows.filter((r) => r.state === st && r.date.startsWith('2020-04')).map((r) => r.stringency)), 1) })).sort((a, b) => a.stringency - b.stringency);
  const dose = {
    subsystem_gap: Object.fromEntries(WEIGHTINGS.map((w) => [w, spread(w)])),
    april_states: { mildest: aprilStates[0], strictest: aprilStates.at(-1) },
  };

  const est = Object.fromEntries(WEIGHTINGS.map((w) => [w, estimates(idx, stringency[w])]));

  // The chart: each day of March to July 2020 against its reference days, and the weighted
  // stringency, by subsystem. Days that are not comparable carry no load value.
  const chart = [];
  for (let k = dayNumber(CHART.from); k <= dayNumber(CHART.to); k += 1) {
    const date = isoDay(k);
    for (const s of SUBSYSTEMS) {
      const r = dayRatio(idx, s, date);
      const st = stringency.capacity.find((x) => x.subsystem === s && x.date === date);
      chart.push({ date, subsystem: s, load_pct: r === null ? null : round(100 * r, 1), stringency: round(st.stringency, 1) });
    }
  }

  const sources = JSON.parse(readFileSync(new URL('sources.json', DATA), 'utf8'));
  const results = {
    generated_by: 'pipelines/power-lockdown/analyse.mjs',
    retrieved: sources.retrieved,
    synthetic: false,
    windows: { pre: PRE, shock: SHOCK, chart: CHART },
    bootstrap: { ...BOOT, block: 'ISO week' },
    checks: { total: checks.length, passed: checks.filter((c) => c.failed === 0).length, list: checks },
    rows: {
      hourly: hourly.length,
      daily: daily.length,
      states: states.length,
      ordinary_days_in_window: lod.BR.day.of,
      days_in_window: dayNumber(SHOCK.to) - dayNumber(SHOCK.from) + 1,
    },
    bridge,
    pre_shock_pct: pre,
    levels: lod,
    activity: activity(nsa.rows, sa.rows),
    april,
    dose,
    estimates: est,
    chart,
  };
  const tables = {
    'daily_load.csv': csv(daily.sort((a, b) => a.date.localeCompare(b.date) || a.subsystem.localeCompare(b.subsystem)).map((d) => ({ ...d, mwh: round(d.mwh, 3) })), ['date', 'subsystem', 'mwh']),
    'bridge.csv': csv(bridge.map((r) => ({ ...r, w_capacity: round(r.w_capacity, 6), w_equal: round(r.w_equal, 6) })), ['state', 'subsystem', 'substations', 'substations_elsewhere', 'mva', 'w_capacity', 'w_equal']),
    'calendar.csv': csv(calendar('2018-01-01', '2021-12-31').map((r) => ({ ...r, holiday: r.holiday ?? '', comparable: r.comparable ? 1 : 0 })), ['date', 'weekday', 'week', 'month', 'quarter', 'holiday', 'ref_a', 'ref_b', 'comparable']),
    'ibcbr.csv': csv(nsa.rows.map((r) => ({ month: r.month, ibcbr: r.value, ibcbr_sa: sa.rows.find((x) => x.month === r.month)?.value })), ['month', 'ibcbr', 'ibcbr_sa']),
  };
  return { results, tables };
}

/** Writes results.json and the tidy tables the semantic layer reads. */
export function run() {
  const { results, tables } = compute();
  writeFileSync(new URL('results.json', DATA), JSON.stringify(results, null, 1) + '\n');
  for (const [name, text] of Object.entries(tables)) writeFileSync(new URL(name, DATA), text);
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = run();
  console.log(`${r.checks.passed} of ${r.checks.total} checks passed`);
  console.log(JSON.stringify({ pre: r.pre_shock_pct, levels: r.levels.BR, activity: r.activity, april: r.april, estimates: r.estimates }, null, 1));
}
