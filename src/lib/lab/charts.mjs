// Data for the charts on the airport and Ask the Ledger Lab pages, read from their saved results,
// and fillLabCharts(), which puts each page's chart in place of its `<div data-lab-chart="…"></div>`
// marker. The charts are drawn by src/lib/charts/ (Altair specs in charts/). No network, no
// hardcoded figures: every number is read from the input.

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
