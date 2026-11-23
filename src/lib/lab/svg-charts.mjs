// Build-time SVG charts for Lab pages that otherwise draw their visuals with JavaScript. The PLD
// chart is made with Altair instead (charts/pld_daily.py, drawn by src/lib/charts/).
// Each function takes the parsed, checked-in results file and returns static HTML (an inline SVG
// and a table view). No network, no hardcoded figures: every number is read from the input.
// fillLabCharts() puts the charts in place of `<div data-lab-chart="…"></div>` markers in a page.

const nf = (digits = 0) => new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const int = (n) => nf(0).format(n);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;
const W = 340;

function figure({ id, title, subtitle, svg, table, source }) {
  return `<figure class="lab-svg-figure" id="${esc(id)}"><figcaption class="lab-svg-caption"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></figcaption>${svg}<details class="lab-svg-table"><summary>Show the numbers</summary>${table}</details><p class="lab-svg-source">Source: <code>${esc(source)}</code>, drawn when the site is built.</p></figure>`;
}

function tableHtml(head, rows) {
  const th = head.map((h) => `<th scope="col">${esc(h)}</th>`).join('');
  const tr = rows.map((cells) => `<tr><th scope="row">${esc(cells[0])}</th>${cells.slice(1).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

// ---------------------------------------------------------------------------------------------
// Airport data contract: every check of the latest run in the copy saved with the page that was not
// a rehearsal. The weekly runs live on the airport-runs branch and appear in the page's replay.
export function airportChartData(results) {
  if (results?.synthetic !== false || !Array.isArray(results.runs)) throw new Error('Unexpected airport results');
  const run = [...results.runs].reverse().find((r) => r.deliberate === false);
  if (!run || !Array.isArray(run.checks) || run.checks.length === 0) throw new Error('No saved non-rehearsal airport run with checks');
  const checks = run.checks.map((c) => ({
    id: String(c.id),
    says: String(c.says ?? c.id),
    failed: Number(c.failed) || 0,
    status: !c.passed ? 'fail' : c.failed > 0 ? 'tolerated' : 'pass',
  }));
  const tally = { pass: 0, tolerated: 0, fail: 0 };
  for (const c of checks) tally[c.status] += 1;
  return { runDate: run.runDate.slice(0, 10), status: run.status, rows: run.rows, checks, tally };
}

const STATUS_TEXT = { pass: 'passed', tolerated: 'within tolerance', fail: 'failed' };

export function airportChart(results) {
  const d = airportChartData(results);
  const perRow = 10, size = 26, gapX = 5, left = 8, top = 22;
  const rows = Math.ceil(d.checks.length / perRow);
  const cells = d.checks.map((c, i) => {
    const cx = left + (i % perRow) * (size + gapX);
    const cy = top + Math.floor(i / perRow) * (size + gapX);
    const label = `${c.id}: ${STATUS_TEXT[c.status]}${c.failed ? ` (${int(c.failed)} rows flagged)` : ''}`;
    return `<g class="lab-svg-check" tabindex="0" aria-label="${esc(label)}"><title>${esc(label)}</title><rect class="lab-svg-cell lab-svg-cell--${c.status}" x="${cx}" y="${cy}" width="${size}" height="${size}" rx="3"/></g>`;
  }).join('');
  const legendY = top + rows * (size + gapX) + 16;
  const legend = ['pass', 'tolerated', 'fail'].map((s, k) => {
    const lx = left + [0, 92, 232][k];
    return `<rect class="lab-svg-cell lab-svg-cell--${s}" x="${lx}" y="${legendY - 10}" width="12" height="12" rx="2"/><text class="lab-svg-legend" x="${lx + 17}" y="${legendY}">${int(d.tally[s])} ${STATUS_TEXT[s]}</text>`;
  }).join('');
  const rowLine = ['airports', 'runways', 'countries'].map((k) => `${int(d.rows[k])} ${k}`).join(' · ');
  const height = legendY + 26;
  const svg = `<svg class="lab-svg" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(`Airport contract, run of ${d.runDate}: ${d.checks.length} checks, ${d.tally.pass} passed, ${d.tally.tolerated} within tolerance, ${d.tally.fail} failed.`)}">`
    + `<defs><pattern id="lab-svg-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="lab-svg-hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" class="lab-svg-hatch-line"/></pattern></defs>`
    + `<text class="lab-svg-axis" x="${left}" y="11">One square per check, in contract order</text>${cells}${legend}`
    + `<text class="lab-svg-note" x="${left}" y="${legendY + 20}">${esc(`${rowLine} checked`)}</text></svg>`;
  const table = tableHtml(['Check', 'Result', 'Rows flagged'], d.checks.map((c) => [c.id, STATUS_TEXT[c.status], int(c.failed)]));
  return figure({
    id: 'airport-checks-chart',
    title: `Contract checks, run of ${d.runDate}`,
    subtitle: `Latest run in the copy saved with this page · ${d.status === 'pass' ? 'passed' : 'failed'} · ${d.checks.length} checks · weekly runs are in the replay`,
    svg,
    table,
    source: 'data/airport-contract/results.json',
  });
}

// ---------------------------------------------------------------------------------------------
// Ask the Ledger: questions right on all four ledgers, of the 47 page questions, by model and prompt.
export const MODEL_NAMES = {
  '@cf/qwen/qwen2.5-coder-32b-instruct': 'Qwen2.5-Coder 32B',
  '@cf/meta/llama-3.2-3b-instruct': 'Llama 3.2 3B',
  '@cf/google/gemma-4-26b-a4b-it': 'Gemma 4 26B A4B',
  '@cf/qwen/qwen3.8-27b': 'Qwen 3.8 27B',
};

export function ledgerChartData(results, suite = 'legacy47') {
  if (!Array.isArray(results?.runs)) throw new Error('Ledger benchmark results have no runs');
  const runs = results.runs.filter((r) => r.suite === suite && r.status === 'complete');
  if (runs.length === 0) throw new Error(`No complete ledger runs for ${suite}`);
  const total = runs[0].questions;
  const bars = runs.map((r) => {
    const name = MODEL_NAMES[r.model];
    if (!name) throw new Error(`Unknown model ${r.model}`);
    if (r.questions !== total || !Number.isSafeInteger(r.rightOnAllFour) || r.rightOnAllFour < 0 || r.rightOnAllFour > total) {
      throw new Error(`Run ${r.githubRunNumber} has an invalid score`);
    }
    return { run: r.githubRunNumber, model: name, prompt: r.prompt, right: r.rightOnAllFour, total };
  });
  bars.sort((a, b) => b.right - a.right || a.run - b.run);
  return { total, bars };
}

export function ledgerChart(results) {
  const d = ledgerChartData(results);
  const left = 8, right = W - 64, rowH = 38, top = 22;
  const scale = (v) => (v / d.total) * (right - left);
  const height = top + d.bars.length * rowH + 22;
  const rows = d.bars.map((b, i) => {
    const y = top + i * rowH;
    const text = `${b.model} · ${b.prompt} prompt: ${b.right} of ${b.total}`;
    const w = Math.max(r1(scale(b.right)), 1.5);
    return `<g class="lab-svg-row"><title>${esc(text)}</title>`
      + `<text class="lab-svg-label" x="${left}" y="${y + 11}">${esc(b.model)} <tspan class="lab-svg-muted">· ${esc(b.prompt)}</tspan></text>`
      + `<rect class="lab-svg-track" x="${left}" y="${y + 17}" width="${right - left}" height="12" rx="2"/>`
      + `<rect class="lab-svg-bar" x="${left}" y="${y + 17}" width="${w}" height="12" rx="2"/>`
      + `<text class="lab-svg-value" x="${W - 8}" y="${y + 27}" text-anchor="end">${b.right} of ${b.total}</text></g>`;
  }).join('');
  const axisY = top + d.bars.length * rowH + 10;
  const svg = `<svg class="lab-svg" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(`Questions right on all four ledgers, out of ${d.total}: ${d.bars.map((b) => `${b.model}, ${b.prompt} prompt, ${b.right}`).join('; ')}.`)}">`
    + `<text class="lab-svg-axis" x="${left}" y="11">Right on all four ledgers, out of ${d.total}</text>${rows}`
    + `<text class="lab-svg-note" x="${left}" y="${axisY}">One run per bar, at temperature 0</text></svg>`;
  const table = tableHtml(['Model', 'Prompt', 'Right on all four', 'GitHub run'], d.bars.map((b) => [b.model, b.prompt, `${b.right} of ${b.total}`, String(b.run)]));
  return figure({
    id: 'ledger-benchmark-chart',
    title: `Model benchmark: ${d.total} page questions`,
    subtitle: `${d.bars.length} runs, by model and prompt · question level, a question counts only if right on all four ledgers`,
    svg,
    table,
    source: 'data/ledger-eval/results.json',
  });
}

// ---------------------------------------------------------------------------------------------
const MARKER = /<div data-lab-chart="([a-z-]+)"><\/div>/g;

export function fillLabCharts(html, charts) {
  const seen = new Set();
  const out = html.replace(MARKER, (_, name) => {
    const make = charts[name];
    if (!make) throw new Error(`Unknown Lab chart "${name}"`);
    if (seen.has(name)) throw new Error(`Lab chart "${name}" appears twice`);
    seen.add(name);
    return make();
  });
  return out;
}
