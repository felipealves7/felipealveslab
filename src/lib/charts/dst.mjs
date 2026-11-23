// The lost hour lab: the chart of each day around the spring clock change (charts/dst_days.py),
// built from data/dst-crashes/results.json. Every value comes from the saved results.
import { altairFigure, tableHtml } from './figure.mjs';
import { loadSpec } from './render.mjs';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const KEYS = ['post', 'pre', 'standard'];
export const signedDay = (o) => (o > 0 ? `+${o}` : o < 0 ? `−${-o}` : '0');

// One row per day, with the three groups' values side by side, checked against each other.
export function dstRows(results) {
  const chart = results?.chart;
  if (!chart || KEYS.some((k) => !Array.isArray(chart[k]))) throw new Error('The clock-change results have no chart series');
  const days = chart.post.map((d) => d.offset);
  if (days.length < 7) throw new Error('The clock-change chart has too few days');
  for (const k of KEYS) {
    if (chart[k].length !== days.length || chart[k].some((d, i) => d.offset !== days[i] || !Number.isFinite(d.index))) {
      throw new Error(`The clock-change series ${k} does not line up with the others`);
    }
  }
  return chart.post.map((d, i) => ({
    offset: d.offset,
    day: `${signedDay(d.offset)} ${DAYS[d.weekday]}`,
    post: chart.post[i].index,
    pre: chart.pre[i].index,
    standard: chart.standard[i].index,
  }));
}

export async function dstFigure(results) {
  const rows = dstRows(results);
  const years = (e) => `${e.nYears} years`;
  return altairFigure({
    id: 'dst-days-chart',
    vlSpec: loadSpec('dst-days'),
    rows: { rows },
    title: 'Fatal crashes on each day around the spring change',
    subtitle: `Each day against an ordinary day of the same weekday (1.0) · day level · US FARS, summed over ${years(results.eras[1])} (2007–2024 without 2020), ${years(results.eras[0])} (1996–2006) and ${years(results.standard)} (Arizona and Hawaii)`,
    label: 'Fatal crashes on each day from 14 days before to 13 days after the spring clock change, against an ordinary day of the same weekday, for states that change their clocks in two eras and for Arizona and Hawaii. The table under the chart lists every value.',
    hint: 'Hover or tap the chart for all three values that day. On a keyboard, tab to the chart and use the arrow keys.',
    table: tableHtml(['Day', 'Change in March, 2007–2024', 'Change in April, 1996–2006', 'No change: Arizona and Hawaii'],
      rows.map((r) => [r.day, r.post.toFixed(2), r.pre.toFixed(2), r.standard.toFixed(2)])),
    source: 'Source: <code>data/dst-crashes/results.json</code>. Chart made with Altair in <code>charts/dst_days.py</code> and drawn when the site is built.',
  });
}
