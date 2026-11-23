// Flight reliability lab: the measure-by-month chart (charts/aviation_months.py) and the arrival
// delay distribution (charts/aviation_delays.py), from the pipeline's saved monthly totals and
// histogram. The figures come from src/lib/aviation/metrics.mjs, which guards the inputs.
import { altairFigure, tableHtml } from './figure.mjs';
import { loadSpec } from './render.mjs';
import { METRICS, METRIC_ORDER, MONTHS, value, fmtValue, fmtInt } from '../aviation/metrics.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// One row per measure and month, the year before and the latest year side by side. Rates are
// carried in percentage points, so the axis reads like the text.
export function monthRows(rows) {
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  if (years.length !== 2) throw new Error('The monthly totals should hold exactly two years');
  const [y0, y1] = years;
  const at = (year, month) => rows.find((r) => r.year === year && r.month === month);
  const out = [];
  for (const key of METRIC_ORDER) {
    const pct = METRICS[key].unit === '%';
    for (let month = 1; month <= 12; month += 1) {
      const a = at(y0, month);
      const b = at(y1, month);
      const va = a ? value(a, key) : null;
      const vb = b ? value(b, key) : null;
      if (va === null && vb === null) continue;
      const text = (v) => (v === null ? 'not in snapshot' : fmtValue(key, v));
      out.push({
        measure: key,
        month,
        yearBefore: String(y0),
        yearAfter: String(y1),
        before: va === null ? null : pct ? va * 100 : va,
        after: vb === null ? null : pct ? vb * 100 : vb,
        axisTitle: `${METRICS[key].label}, ${pct ? '% of flights' : 'minutes'}`,
        readout: [`${MONTHS[month - 1]}`, [text(va), String(y0)], [text(vb), String(y1)]],
      });
    }
  }
  return { rows: out, years };
}

export async function monthsFigure(rows) {
  const { rows: data, years } = monthRows(rows);
  const [y0, y1] = years;
  const months = (k) => data.filter((r) => r.measure === k);
  const definitions = `<dl class="altair-terms">${METRIC_ORDER.map((k) => `<div><dt>${esc(METRICS[k].short)}</dt><dd>${esc(METRICS[k].definition)}</dd></div>`).join('')}</dl>`;
  return altairFigure({
    id: 'aviation-months-chart',
    vlSpec: loadSpec('aviation-months'),
    rows: { rows: data },
    title: `One measure by month, ${y1} against ${y0}`,
    subtitle: `${y0} in gray, as context; ${y1} in olive, to the latest month published · month level · rates are monthly sums divided, never averaged`,
    label: `One measure by month, ${y1} against ${y0}, from the saved monthly totals. Without JavaScript it shows the ${METRICS[METRIC_ORDER[0]].label.toLowerCase()}; the table under the chart lists every measure.`,
    controls: [{ param: 'measure', label: 'Measure', options: METRIC_ORDER.map((k) => ({ value: k, label: METRICS[k].short })) }],
    hint: 'Pick a measure. Hover or tap the chart for both years in a month; on a keyboard, tab to the chart and use the arrow keys.',
    extra: definitions,
    table: tableHtml(['Month', ...METRIC_ORDER.map((k) => METRICS[k].short)], MONTHS.map((name, i) => [
      name,
      ...METRIC_ORDER.map((k) => {
        const r = months(k).find((q) => q.month === i + 1);
        return r ? `${r.readout[1][0]} → ${r.readout[2][0]}` : '–';
      }),
    ])) + `<p>Each cell: ${y0} → ${y1}.</p>`,
    source: 'Source: <code>data/aviation-reliability/mart_month.csv</code>, the pipeline\'s monthly table. Chart made with Altair in <code>charts/aviation_months.py</code> and drawn when the site is built.',
    className: 'altair-figure--section',
  });
}

const TICKS = (start) => (start === -60 ? '< −30' : start === 180 ? '180+' : start < 0 ? `−${-start}` : String(start));

export function delayRows(bins) {
  return bins.map((b) => ({
    start: b.start,
    tick: TICKS(b.start),
    flights: b.flights,
    late: b.late,
    readout: { Band: b.label, Flights: fmtInt(b.flights), Share: `${(b.share * 100).toFixed(1)}%` },
  }));
}

export async function delaysFigure(bins, { from, to }) {
  const total = bins.reduce((n, b) => n + b.flights, 0);
  return altairFigure({
    id: 'aviation-delays-chart',
    vlSpec: loadSpec('aviation-delays'),
    rows: { rows: delayRows(bins) },
    title: 'Arrival delay, in 15-minute bands',
    subtitle: `${fmtInt(total)} observed arrivals, ${from} to ${to} · flight level, counted in bands`,
    label: `Arrival delay of ${fmtInt(total)} observed arrivals, ${from} to ${to}, in 15-minute bands. Most flights arrive early; the late tail runs past 180 minutes. The table under the chart lists every band.`,
    hint: 'Hover or tap a band for its count and share; on a keyboard, tab to the chart and use the arrow keys.',
    table: tableHtml(['Arrival', 'Flights', 'Share'], bins.map((b) => [b.label, fmtInt(b.flights), `${(b.share * 100).toFixed(1)}%`])),
    source: 'Bands: <code>data/aviation-reliability/delay_histogram.csv</code>. Chart made with Altair in <code>charts/aviation_delays.py</code> and drawn when the site is built.',
    className: 'altair-figure--section',
  });
}
