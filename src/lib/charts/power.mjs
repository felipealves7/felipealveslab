// Lockdown and power-load lab: the daily load chart (charts/power_lockdown.py), built from
// data/power-lockdown/results.json. Every value comes from the saved results.
import { altairFigure, tableHtml } from './figure.mjs';
import { loadSpec } from './render.mjs';

export const SUBSYSTEMS = ['SE', 'S', 'NE', 'N'];
export const NAMES = { SE: 'Southeast/Centre-West', S: 'South', NE: 'Northeast', N: 'North' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (iso) => `${DAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]} ${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const loadText = (v) => (v === null ? 'left out' : v.toFixed(1));

// One row per subsystem and day, each carrying all four subsystems' values for the readout.
export function powerRows(results) {
  const chart = results?.chart;
  if (!Array.isArray(chart) || chart.length === 0) throw new Error('The power-load results have no chart rows');
  const byDay = new Map();
  for (const r of chart) {
    if (!SUBSYSTEMS.includes(r.subsystem)) throw new Error(`Unknown subsystem ${r.subsystem}`);
    if (!Number.isFinite(r.stringency)) throw new Error(`No stringency for ${r.subsystem} on ${r.date}`);
    if (!byDay.has(r.date)) byDay.set(r.date, {});
    byDay.get(r.date)[r.subsystem] = r;
  }
  for (const [date, v] of byDay) if (SUBSYSTEMS.some((s) => !v[s])) throw new Error(`Day ${date} lacks a subsystem`);
  const rows = [];
  for (const [date, v] of byDay) {
    const all = Object.fromEntries(SUBSYSTEMS.flatMap((s) => [[`${s}_load`, loadText(v[s].load_pct)], [`${s}_stringency`, v[s].stringency]]));
    SUBSYSTEMS.forEach((s, order) => {
      rows.push({ date, panel: NAMES[s], order, load_pct: v[s].load_pct, stringency: v[s].stringency, ...all });
    });
  }
  return rows;
}

export async function powerFigure(results) {
  const rows = powerRows(results);
  const dates = [...new Set(rows.map((r) => r.date))];
  const kept = rows.filter((r) => r.load_pct !== null && r.order === 0).length;
  return altairFigure({
    id: 'power-lockdown-chart',
    vlSpec: loadSpec('power-lockdown'),
    rows: { rows },
    title: 'Power load and lockdown stringency by subsystem, March to July 2020',
    subtitle: `Day level · line: load as a per cent of the same weekdays in 2018 and 2019 (100 = as then), ${kept} of ${dates.length} days compared · strip: stringency 0–100, darker the stricter, weighted by transformer capacity · ONS and OxCGRT`,
    label: 'Daily power load from 1 March to 31 July 2020 as a per cent of the same weekdays in 2018 and 2019, one panel per subsystem, over the lockdown stringency of each subsystem, weighted across its states. Holidays and days compared with a holiday are gaps. The table under the chart lists every value.',
    hint: 'Hover or tap a panel for all four subsystems that day. On a keyboard, tab to the chart and use the arrow keys.',
    table: tableHtml(['Day', ...SUBSYSTEMS.map((s) => `${NAMES[s]}: load, %`), ...SUBSYSTEMS.map((s) => `${NAMES[s]}: stringency`)],
      dates.map((d) => {
        const r = rows.find((x) => x.date === d);
        return [dayLabel(d), ...SUBSYSTEMS.map((s) => r[`${s}_load`]), ...SUBSYSTEMS.map((s) => r[`${s}_stringency`].toFixed(1))];
      })),
    source: 'Source: <code>data/power-lockdown/results.json</code>, from ONS hourly load and OxCGRT. Chart made with Altair in <code>charts/power_lockdown.py</code> and drawn when the site is built.',
  });
}
