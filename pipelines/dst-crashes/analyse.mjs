// Estimates from data/dst-crashes/window.csv -> data/dst-crashes/results.json.
//
// Design, fixed in this file before any estimate was read:
// - Offsets count days from a spring Sunday (0). The work week after it is offsets 1-5 (Mon-Fri).
// - The comparison days are the same weekdays in the two weeks before and the week after:
//   offsets -13..-9, -6..-2 and 8..12. Fifteen days against five.
// - Rate ratio = (crashes per work-week day) / (crashes per comparison day), pooled over years.
// - 95% intervals: percentile bootstrap over years (4,000 resamples, fixed seed), so a year's
//   days move together.
// - 2020 is left out of the main estimates: lockdowns began in the comparison week after the
//   8 March 2020 change. It is shown separately.
// - "Observing" and "standard" come from the IANA clock rules for each state's zone.
import { readFileSync, writeFileSync } from 'node:fs';

export const TREAT = [1, 2, 3, 4, 5];
export const CONTROL = [-13, -12, -11, -10, -9, -6, -5, -4, -3, -2, 8, 9, 10, 11, 12];
// Sensitivity check added after the placebo dates were read: one week before and one after, so a
// steady seasonal rise cancels out. Reported next to the main design, not in its place.
export const CONTROL_SYMMETRIC = [-6, -5, -4, -3, -2, 8, 9, 10, 11, 12];
export const EXCLUDE_YEARS = [2020];
export const B = 4000;
export const SEED = 20261117;

const DATA = new URL('../../data/dst-crashes/', import.meta.url);

export function parseWindow(text) {
  const [head, ...lines] = text.trim().split('\n');
  const cols = head.split(',');
  return lines.map((l) => {
    const v = l.split(',');
    const o = {};
    cols.forEach((c, i) => { o[c] = ['anchor', 'state', 'group', 'date'].includes(c) ? v[i] : Number(v[i]); });
    return o;
  });
}

/** Seeded PRNG (mulberry32), so intervals are the same on every run. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Per-year sums of a field on the treatment and comparison days, for the rows a filter keeps.
 * Returns [{ year, t, c }], one entry per year in `years`, zeros where nothing matched.
 */
export function yearSums(rows, filter, field, years, control = CONTROL) {
  const by = new Map(years.map((y) => [y, { year: y, t: 0, c: 0 }]));
  for (const r of rows) {
    if (!by.has(r.year) || !filter(r)) continue;
    if (TREAT.includes(r.offset)) by.get(r.year).t += r[field];
    else if (control.includes(r.offset)) by.get(r.year).c += r[field];
  }
  return [...by.values()];
}

export function rateRatio(sums, control = CONTROL) {
  const t = sums.reduce((n, s) => n + s.t, 0);
  const c = sums.reduce((n, s) => n + s.c, 0);
  return (t / TREAT.length) / (c / control.length);
}

/** Extra events per year in the work week, against the comparison-day rate. */
export function excessPerYear(sums, control = CONTROL) {
  const t = sums.reduce((n, s) => n + s.t, 0);
  const c = sums.reduce((n, s) => n + s.c, 0);
  return (t - (c * TREAT.length) / control.length) / sums.length;
}

function percentile(sorted, p) {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}

/** Bootstrap a statistic of several aligned year-sum arrays, resampling years jointly. */
export function bootstrap(arrays, stat, { b = B, seed = SEED } = {}) {
  const rand = rng(seed);
  const n = arrays[0].length;
  const out = [];
  for (let k = 0; k < b; k++) {
    const idx = Array.from({ length: n }, () => Math.floor(rand() * n));
    out.push(stat(...arrays.map((a) => idx.map((i) => a[i]))));
  }
  out.sort((x, y) => x - y);
  return [percentile(out, 0.025), percentile(out, 0.975)];
}

const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const total = (sums, k) => sums.reduce((n, s) => n + s[k], 0);

/** One estimate: rate ratio with interval, counts, and excess per year (crashes and deaths). */
export function estimate(rows, { label, filter, years, field = 'crashes', control = CONTROL }) {
  const s = yearSums(rows, filter, field, years, control);
  const deaths = yearSums(rows, filter, 'deaths', years, control);
  const rr = (x) => rateRatio(x, control);
  const ex = (x) => excessPerYear(x, control);
  const out = {
    label, years: [years[0], years.at(-1)], nYears: years.length, field,
    treatDays: TREAT.length * years.length, controlDays: control.length * years.length,
    treat: total(s, 't'), control: total(s, 'c'),
    rateRatio: round(rr(s)), interval95: bootstrap([s], rr).map((x) => round(x)),
    excessPerYear: round(ex(s), 1), excessInterval95: bootstrap([s], ex).map((x) => round(x, 1)),
  };
  if (field === 'crashes') {
    out.deathsTreat = total(deaths, 't');
    out.deathsControl = total(deaths, 'c');
    out.excessDeathsPerYear = round(ex(deaths), 1);
    out.excessDeathsInterval95 = bootstrap([deaths], ex).map((x) => round(x, 1));
  }
  return out;
}

/** Ratio of two groups' rate ratios, both resampled with the same years. */
export function ratioOfRatios(rows, { label, filterA, filterB, years, control = CONTROL }) {
  const a = yearSums(rows, filterA, 'crashes', years, control);
  const b = yearSums(rows, filterB, 'crashes', years, control);
  const f = (x, y) => rateRatio(x, control) / rateRatio(y, control);
  return { label, years: [years[0], years.at(-1)], nYears: years.length, ratio: round(f(a, b)), interval95: bootstrap([a, b], f).map((x) => round(x)) };
}

/**
 * Chart series: for each offset, crashes on that day divided by the mean of the comparison days
 * with the same weekday. 1.0 = an ordinary day of that weekday.
 */
export function dailyIndex(rows, filter, years, from = -14, to = 13) {
  const byOffset = new Map();
  const ys = new Set(years);
  for (const r of rows) {
    if (!ys.has(r.year) || !filter(r)) continue;
    byOffset.set(r.offset, (byOffset.get(r.offset) ?? 0) + r.crashes);
  }
  const wd = (o) => ((o % 7) + 7) % 7;
  const base = new Map();
  for (const o of [...CONTROL, -14, -7, -8, -1, 7, 13]) {
    // Weekend comparison days: the Saturdays and Sundays of the same three comparison weeks.
    const k = wd(o);
    if (!base.has(k)) base.set(k, []);
    if (!base.get(k).includes(o)) base.get(k).push(o);
  }
  const out = [];
  for (let o = from; o <= to; o++) {
    const days = base.get(wd(o));
    const mean = days.reduce((n, d) => n + (byOffset.get(d) ?? 0), 0) / days.length;
    out.push({ offset: o, weekday: wd(o), crashes: byOffset.get(o) ?? 0, index: round((byOffset.get(o) ?? 0) / mean) });
  }
  return out;
}

export function range(a, b, skip = []) {
  const out = [];
  for (let y = a; y <= b; y++) if (!skip.includes(y)) out.push(y);
  return out;
}

export function analyse(rows, extract) {
  const obs = (r) => r.group === 'observing';
  const std = (r) => r.group === 'standard';
  const change = (r) => r.is_change === 1;
  const placebo = (r) => r.is_change === 0;
  const and = (...fs) => (r) => fs.every((f) => f(r));
  const all = range(1996, 2024, EXCLUDE_YEARS);
  const pre = range(1996, 2006);
  const post = range(2007, 2024, EXCLUDE_YEARS);
  const sunYears = range(2001, 2024, EXCLUDE_YEARS);

  const main = estimate(rows, { label: 'Observing states, work week after the spring change', filter: and(obs, change), years: all });
  const eras = [
    estimate(rows, { label: 'Observing states, change on the first Sunday of April', filter: and(obs, change), years: pre }),
    estimate(rows, { label: 'Observing states, change on the second Sunday of March', filter: and(obs, change), years: post }),
    estimate(rows, { label: 'Observing states, 2007-2015', filter: and(obs, change), years: range(2007, 2015) }),
    estimate(rows, { label: 'Observing states, 2016-2024', filter: and(obs, change), years: range(2016, 2024, EXCLUDE_YEARS) }),
  ];
  const placebos = [
    estimate(rows, { label: 'Observing states, second Sunday of March while the change was in April', filter: and(obs, placebo), years: pre }),
    estimate(rows, { label: 'Observing states, first Sunday of April after the change moved to March', filter: and(obs, placebo), years: post }),
  ];
  const standard = estimate(rows, { label: 'Arizona and Hawaii, same dates', filter: and(std, change), years: all });
  const did = ratioOfRatios(rows, { label: 'Observing against Arizona and Hawaii', filterA: and(obs, change), filterB: and(std, change), years: all });
  const timeOfDay = [
    estimate(rows, { label: 'Morning, 05:00-09:59 clock time', filter: and(obs, change), years: all, field: 'crashes_am' }),
    estimate(rows, { label: 'Evening, 16:00-20:59 clock time', filter: and(obs, change), years: all, field: 'crashes_pm' }),
  ];
  const sun = [
    estimate(rows, { label: 'Crashes with the sun up', filter: and(obs, change), years: sunYears, field: 'crashes_sun_day' }),
    estimate(rows, { label: 'Crashes in the dark (sun below -6°)', filter: and(obs, change), years: sunYears, field: 'crashes_sun_dark' }),
  ];
  const with2020 = estimate(rows, { label: 'Observing states, 1996-2024 including 2020', filter: and(obs, change), years: range(1996, 2024) });
  const only2020 = yearSums(rows, and(obs, change), 'crashes', [2020])[0];
  const replication = [
    { ...estimate(rows, { label: 'Fritz et al. years: 1996-2017', filter: and(obs, change), years: range(1996, 2017) }), reference: 'fritz2020' },
    { ...estimate(rows, { label: 'Smith years: 2002-2011', filter: and(obs, change), years: range(2002, 2011) }), reference: 'smith2016' },
  ];
  const sym = { control: CONTROL_SYMMETRIC };
  const symmetric = {
    main: estimate(rows, { ...sym, label: 'Observing states, symmetric comparison weeks', filter: and(obs, change), years: all }),
    pre: estimate(rows, { ...sym, label: 'Observing states, April change, symmetric weeks', filter: and(obs, change), years: pre }),
    post: estimate(rows, { ...sym, label: 'Observing states, March change, symmetric weeks', filter: and(obs, change), years: post }),
    placeboPre: estimate(rows, { ...sym, label: 'Placebo: second Sunday of March before 2007, symmetric weeks', filter: and(obs, placebo), years: pre }),
    placeboPost: estimate(rows, { ...sym, label: 'Placebo: first Sunday of April from 2007, symmetric weeks', filter: and(obs, placebo), years: post }),
    standard: estimate(rows, { ...sym, label: 'Arizona and Hawaii, symmetric weeks', filter: and(std, change), years: all }),
    did: ratioOfRatios(rows, { ...sym, label: 'Observing against Arizona and Hawaii, symmetric weeks', filterA: and(obs, change), filterB: and(std, change), years: all }),
  };
  const perYear = range(1996, 2024).map((y) => {
    const s = yearSums(rows, and(obs, change), 'crashes', [y])[0];
    return { year: y, treat: s.t, control: s.c, rateRatio: round(rateRatio([s])) };
  });
  const chart = {
    pre: dailyIndex(rows, and(obs, change), pre),
    post: dailyIndex(rows, and(obs, change), post),
    standard: dailyIndex(rows, and(std, change), all),
  };
  const ys = extract.years;
  const sumY = (k) => ys.reduce((n, y) => n + y[k], 0);
  const agreement = ys.reduce((a, y) => ({ both: a.both + y.agreement.both, agree: a.agree + y.agreement.agree }), { both: 0, agree: 0 });
  return {
    generated: extract.generated,
    design: { treat: TREAT, control: CONTROL, controlSymmetric: CONTROL_SYMMETRIC, excludeYears: EXCLUDE_YEARS, bootstrap: B, seed: SEED },
    data: {
      years: [ys[0].year, ys.at(-1).year], crashes: sumY('crashes'), deaths: sumY('deaths'), rows: sumY('rows'),
      droppedUnknownDate: ys.reduce((n, y) => n + (y.dropped['unknown date'] ?? 0), 0),
      crashWindowPairs: sumY('inWindow'), excludedPairs: sumY('excluded'), sunJoined: sumY('sunJoined'),
      timeUnknown: sumY('timeUnknown'), sunAgreement: agreement,
      layouts: ys.map((y) => ({ year: y.year, member: y.member, columns: y.columns, byteOrderMark: y.byteOrderMark, hasCoordinates: y.hasCoordinates })),
    },
    main, eras, placebos, standard, did, timeOfDay, sun, with2020, only2020, replication, symmetric, perYear, chart,
  };
}

function main() {
  const rows = parseWindow(readFileSync(new URL('window.csv', DATA), 'utf8'));
  const extract = JSON.parse(readFileSync(new URL('extract.json', DATA), 'utf8'));
  const out = analyse(rows, extract);
  writeFileSync(new URL('results.json', DATA), JSON.stringify(out, null, 1) + '\n');
  const p = (e) => console.log(`${e.label}: RR ${e.rateRatio} [${e.interval95}] T=${e.treat} C=${e.control} excess/yr ${e.excessPerYear} [${e.excessInterval95}]${e.excessDeathsPerYear !== undefined ? ` deaths/yr ${e.excessDeathsPerYear} [${e.excessDeathsInterval95}]` : ''}`);
  [out.main, ...out.eras, ...out.placebos, out.standard, ...out.timeOfDay, ...out.sun, out.with2020, ...out.replication].forEach(p);
  console.log(out.did);
  Object.values(out.symmetric).forEach((e) => (e.ratio ? console.log(e) : p(e)));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
