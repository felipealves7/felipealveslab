// The charts in the live pieces of the Ask the Ledger and airport Lab pages: the model benchmark
// (charts/bars.py) and the contract checks of the latest run (charts/checks.py), from the saved
// results through src/lib/lab/charts.mjs.
import { altairFigure, tableHtml } from './figure.mjs';
import { barsFigure } from './bars.mjs';
import { loadSpec } from './render.mjs';
import { ledgerChartData, airportChartData } from '../lab/charts.mjs';

const int = (n) => new Intl.NumberFormat('en-GB').format(n);
const STATUS_TEXT = { pass: 'passed', tolerated: 'within tolerance', fail: 'failed' };

export function ledgerFigure(results) {
  const d = ledgerChartData(results);
  return barsFigure({
    id: 'ledger-benchmark-chart',
    scaleMax: d.total,
    rows: d.bars.map((b) => ({
      key: `run-${b.run}`,
      label: `${b.model} · ${b.prompt}`,
      value: b.right,
      text: `${b.right} of ${b.total}`,
      readout: [`${b.model}, ${b.prompt} prompt`, [`${b.right} of ${b.total}`, 'right on all four'], [`#${b.run}`, 'GitHub run']],
    })),
    title: `Model benchmark: ${d.total} page questions`,
    subtitle: `${d.bars.length} runs, by model and prompt, one run each at temperature 0 · question level: a question counts only if right on all four ledgers`,
    label: `Questions right on all four ledgers, out of ${d.total}: ${d.bars.map((b) => `${b.model}, ${b.prompt} prompt, ${b.right}`).join('; ')}.`,
    hint: 'Hover or tap a bar for its run. On a keyboard, tab to the chart and use the arrow keys.',
    table: tableHtml(['Model', 'Prompt', 'Right on all four', 'GitHub run'], d.bars.map((b) => [b.model, b.prompt, `${b.right} of ${b.total}`, String(b.run)])),
    source: 'Source: <code>data/ledger-eval/results.json</code>. Chart made with Altair in <code>charts/bars.py</code> and drawn when the site is built.',
  });
}

// The checks of the latest saved run that was not a rehearsal, ten squares to a row.
export function checkRows(checks) {
  return checks.map((c, i) => ({
    id: c.id,
    order: i,
    col: i % 10,
    row: Math.floor(i / 10),
    status: c.status,
    readout: [c.id, [STATUS_TEXT[c.status], c.says], ...(c.failed ? [[int(c.failed), 'rows flagged']] : [])],
  }));
}

export function airportFigure(results, { compact = false, tag, id = 'airport-checks-chart', live } = {}) {
  const d = airportChartData(results);
  const tally = ['pass', 'tolerated', 'fail'].map((s) => `${int(d.tally[s])} ${STATUS_TEXT[s]}`).join(' · ');
  const rowLine = ['airports', 'runways', 'countries'].map((k) => `${int(d.rows[k])} ${k}`).join(' · ');
  return altairFigure({
    id,
    tag,
    compact,
    live,
    vlSpec: loadSpec('checks'),
    rows: { rows: checkRows(d.checks) },
    title: compact ? undefined : `Contract checks, run of ${d.runDate}`,
    subtitle: compact ? undefined : `Latest run in the copy saved with this page · ${d.status === 'pass' ? 'passed' : 'failed'} · ${d.checks.length} checks, one square each in contract order · weekly runs are in the replay`,
    label: `Airport contract, run of ${d.runDate}: ${d.checks.length} checks, ${d.tally.pass} passed, ${d.tally.tolerated} within tolerance, ${d.tally.fail} failed.`,
    note: `${tally}. ${rowLine} checked.`,
    hint: 'Hover or tap a square for its check. On a keyboard, tab to the chart and use the arrow keys.',
    table: compact ? undefined : tableHtml(['Check', 'Result', 'Rows flagged'], d.checks.map((c) => [c.id, STATUS_TEXT[c.status], int(c.failed)])),
    source: compact ? undefined : 'Source: <code>data/airport-contract/results.json</code>. Chart made with Altair in <code>charts/checks.py</code> and drawn when the site is built.',
  });
}
