// Build-time SVG charts on the airport and Ask the Ledger pages: the numbers come from the checked-in
// results, and each page places its chart inside `## The live piece`. The PLD page's chart is an
// Altair chart, tested in scripts/altair-charts.test.mjs; its marker is checked here with the others.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { airportChart, airportChartData, ledgerChart, ledgerChartData, fillLabCharts } from '../src/lib/lab/svg-charts.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));
const airport = json('data/airport-contract/results.json');
const ledger = json('data/ledger-eval/results.json');

test('Airport chart: latest non-rehearsal run, 18 passed, 1 within tolerance, 0 failed', () => {
  const d = airportChartData(airport);
  assert.equal(d.checks.length, 19);
  assert.deepEqual(d.tally, { pass: 18, tolerated: 1, fail: 0 });
  assert.equal(d.checks.find((c) => c.status === 'tolerated').id, 'runways.length_positive');
  const html = airportChart(airport);
  assert.equal((html.match(/class="lab-svg-cell lab-svg-cell--/g) || []).length, 19 + 3);
  assert.match(html, />18 passed</);
  assert.match(html, />1 within tolerance</);
  assert.match(html, />0 failed</);
  // The page's replay reads newer weekly runs, so the chart names the copy it was drawn from.
  assert.match(html, /Latest run in the copy saved with this page/);
  assert.doesNotMatch(html, /Latest saved run/);
});

test('Airport chart skips rehearsals', () => {
  const onlyRehearsal = { ...airport, runs: airport.runs.filter((r) => r.deliberate) };
  assert.throws(() => airportChartData(onlyRehearsal), /No saved non-rehearsal/);
});

test('Ledger chart: six runs on the 47 page questions, as in the page table', () => {
  const d = ledgerChartData(ledger);
  assert.equal(d.total, 47);
  assert.deepEqual(d.bars.map((b) => `${b.model} · ${b.prompt} · ${b.right}`), [
    'Qwen 3.8 27B · candidate · 42',
    'Gemma 4 26B A4B · candidate · 36',
    'Qwen2.5-Coder 32B · candidate · 35',
    'Qwen2.5-Coder 32B · baseline · 31',
    'Gemma 4 26B A4B · baseline · 28',
    'Llama 3.2 3B · candidate · 1',
  ]);
  const page = read('src/content/lab/ask-the-ledger.md');
  for (const b of d.bars) assert.ok(page.includes(`| 47 page questions · ${b.prompt} · ${b.model} | ${b.right} of 47 |`), `${b.model} ${b.prompt}`);
  assert.match(ledgerChart(ledger), />42 of 47</);
});

test('Ledger chart refuses an unknown model', () => {
  const broken = structuredClone(ledger);
  broken.runs[0].model = '@cf/unknown/model';
  assert.throws(() => ledgerChartData(broken), /Unknown model/);
});

test('fillLabCharts replaces known markers once and rejects unknown or repeated ones', () => {
  const charts = { a: () => '<svg></svg>' };
  assert.equal(fillLabCharts('<p>x</p><div data-lab-chart="a"></div>', charts), '<p>x</p><svg></svg>');
  assert.equal(fillLabCharts('<p>no marker</p>', charts), '<p>no marker</p>');
  assert.throws(() => fillLabCharts('<div data-lab-chart="b"></div>', charts), /Unknown/);
  assert.throws(() => fillLabCharts('<div data-lab-chart="a"></div><div data-lab-chart="a"></div>', charts), /twice/);
});

test('each page places its chart marker once, inside ## The live piece', () => {
  for (const [slug, name] of [['brazil-power-price-contract', 'pld'], ['airport-data-contract', 'airport'], ['ask-the-ledger', 'ledger']]) {
    const page = read(`src/content/lab/${slug}.md`);
    const marker = `<div data-lab-chart="${name}"></div>`;
    assert.equal(page.split(marker).length, 2, slug);
    const at = page.indexOf(marker);
    assert.ok(at > page.indexOf('## The live piece') && at < page.indexOf('## Method and results'), slug);
  }
});
