// data/aviation-shutdown/daily-exposure.csv -> results.json: what the FAA's November 2025 flight cuts did
// to flights touching the 40 listed airports, against flights between two unlisted airports.
//
// Usage: node pipelines/aviation-shutdown/analyse.mjs
// Rates are sums before division (data/aviation-reliability/metric-contract.json). Periods are calendar
// days in 2025; the comparison for volume is the same weekday in the four weeks before the order.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../airport-contract/csv.mjs';
import { TOTALS } from './extract.mjs';
import { APPLIED_CUTS, EXPOSURES } from './order.mjs';

export const PERIODS = Object.freeze([
  { key: 'before', label: 'Before the shutdown', from: '2025-09-01', to: '2025-09-30' },
  { key: 'shutdown', label: 'Shutdown, before the order', from: '2025-10-01', to: '2025-11-06' },
  { key: 'order', label: 'Order in force', from: '2025-11-07', to: '2025-11-16' },
  { key: 'after', label: 'After the order', from: '2025-11-17', to: '2025-11-30' },
]);
/** The four weeks before the order: the weekday baseline for scheduled volume. */
export const BASELINE = Object.freeze({ from: '2025-10-10', to: '2025-11-06' });

export function readDaily(text) {
  return parseCsv(text).rows.map((r) => {
    const o = { ...r };
    for (const k of [...TOTALS, 'cut']) o[k] = Number(o[k]);
    return o;
  });
}

const sum = (rows) => Object.fromEntries(TOTALS.map((k) => [k, rows.reduce((s, r) => s + r[k], 0)]));
const ratio = (n, d) => (d === 0 ? null : n / d);
const within = (date, p) => date >= p.from && date <= p.to;

/** Totals and rates for a set of daily rows. */
export function rates(rows) {
  const t = sum(rows);
  return {
    ...t,
    cancellation_rate: ratio(t.cancelled, t.scheduled),
    nas_share_of_cancellations: ratio(t.cancelled_nas, t.cancelled),
    arrival_otp: ratio(t.on_time, t.observed_arrivals),
    mean_signed_delay: ratio(t.arrival_delay_sum, t.observed_arrivals),
  };
}

/** Each period, for each exposure group and for all flights. */
export function byPeriod(daily) {
  return PERIODS.map((p) => {
    const inP = daily.filter((r) => within(r.date, p));
    return {
      ...p,
      days: new Set(inP.map((r) => r.date)).size,
      all: rates(inP),
      ...Object.fromEntries(EXPOSURES.map((e) => [e, rates(inP.filter((r) => r.exposure === e))])),
    };
  });
}

/** Change in the cancellation rate from the shutdown weeks to the order days, in percentage points,
 *  for an exposed group, less the same change on routes with no listed airport. */
export function differenceInDifferences(periods, group) {
  const p = Object.fromEntries(periods.map((x) => [x.key, x]));
  const change = (g) => (p.order[g].cancellation_rate - p.shutdown[g].cancellation_rate) * 100;
  return { group, change_pp: change(group), comparison_change_pp: change('none'), difference_pp: change(group) - change('none') };
}

const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Scheduled flights on each order day against the mean for the same weekday in the four weeks before. */
export function scheduledAgainstWeekday(daily, group) {
  const rows = daily.filter((r) => r.exposure === group);
  const base = rows.filter((r) => within(r.date, BASELINE));
  const order = PERIODS.find((x) => x.key === 'order');
  const days = rows.filter((r) => within(r.date, order)).map((r) => {
    const same = base.filter((b) => weekday(b.date) === weekday(r.date));
    const expected = same.reduce((s, b) => s + b.scheduled, 0) / same.length;
    return { date: r.date, cut: r.cut, scheduled: r.scheduled, expected, change: r.scheduled / expected - 1 };
  });
  const scheduled = days.reduce((s, d) => s + d.scheduled, 0);
  const expected = days.reduce((s, d) => s + d.expected, 0);
  return { group, days, scheduled, expected, change: scheduled / expected - 1 };
}

/** The same cancellations read by day and by month: the month hides the spike. */
export function levelOfDetail(daily) {
  const byDate = new Map();
  for (const r of daily) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  const days = [...byDate].map(([date, rows]) => ({ date, ...rates(rows) }));
  const november = rates(daily.filter((r) => r.date.startsWith('2025-11')));
  const october = rates(daily.filter((r) => r.date.startsWith('2025-10')));
  const peak = days.reduce((a, b) => (b.cancellation_rate > a.cancellation_rate ? b : a));
  return {
    october: { cancellation_rate: october.cancellation_rate, mean_signed_delay: october.mean_signed_delay, scheduled: october.scheduled, cancelled: october.cancelled },
    november: { cancellation_rate: november.cancellation_rate, mean_signed_delay: november.mean_signed_delay, scheduled: november.scheduled, cancelled: november.cancelled },
    peak_day: { date: peak.date, cancellation_rate: peak.cancellation_rate, cancelled: peak.cancelled, scheduled: peak.scheduled, mean_signed_delay: peak.mean_signed_delay },
  };
}

/** Cancellation rate by the size of the cut in force, for flights touching a listed airport and for the rest. */
export function byCut(daily) {
  const cuts = [...new Set(APPLIED_CUTS.map((s) => s.cut))].sort((a, b) => a - b);
  return cuts.map((cut) => {
    const rows = daily.filter((r) => r.cut === cut);
    const exposed = rates(rows.filter((r) => r.exposure !== 'none'));
    const unexposed = rates(rows.filter((r) => r.exposure === 'none'));
    return {
      cut,
      days: new Set(rows.map((r) => r.date)).size,
      exposed: { scheduled: exposed.scheduled, cancelled: exposed.cancelled, cancellation_rate: exposed.cancellation_rate },
      unlisted: { scheduled: unexposed.scheduled, cancelled: unexposed.cancelled, cancellation_rate: unexposed.cancellation_rate },
    };
  });
}

export function analyse(daily) {
  const periods = byPeriod(daily);
  return {
    periods,
    by_cut: byCut(daily),
    difference_in_differences: ['both', 'one'].map((g) => differenceInDifferences(periods, g)),
    scheduled_against_weekday: EXPOSURES.map((g) => scheduledAgainstWeekday(daily, g)),
    level_of_detail: levelOfDetail(daily),
    applied_cuts: APPLIED_CUTS,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = new URL('../../data/aviation-shutdown/', import.meta.url);
  const daily = readDaily(readFileSync(new URL('daily-exposure.csv', root), 'utf8'));
  writeFileSync(new URL('results.json', root), `${JSON.stringify(analyse(daily), null, 2)}\n`);
}
