// The site's Altair charts (charts/*.py → src/charts/*.vl.json → src/lib/charts/). The PLD chart is
// drawn here from the saved results the way the build draws it, and every figure it shows is worked
// out again from the results to check it. Run: node --test scripts/altair-charts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileChart, renderStatic, siteLoader, relativePolyline, textWidth } from '../src/lib/charts/render.mjs';
import { pldFigure, pldDaily, longDate, SUBMARKETS } from '../src/lib/charts/pld.mjs';
import { WIDE, NARROW } from '../src/lib/charts/figure.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));
const results = json('data/ccee-pld/results.json');
const spec = json('src/charts/pld-daily.vl.json');
const vega = compileChart(spec);
const daily = results.summary.daily;

// Points in a line's path: one M and one step per point, absolute or relative.
const pathPoints = (d) => (d.startsWith('M') && d.includes('l') ? 1 + d.split('l')[1].match(/-?[\d.]+[,-]?-?[\d.]+/g).length : (d.match(/[ML]/g) || []).length);
const lines = (svg) => [...svg.matchAll(/<g class="mark-line role-mark line_marks"[^>]*><path [^>]*d="([^"]+)"/g)].map((m) => m[1]);
const texts = (svg) => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
// The panel title the chart should print, worked out here from the results.
function peakTitle(s, from = '0000', to = '9999') {
  let best = -1;
  daily.series[s].forEach((v, i) => { const d = daily.dates[i]; if (d >= from && d <= to && (best < 0 || v > daily.series[s][best])) best = i; });
  return `${s} · peak ${Math.round(daily.series[s][best])} on ${longDate(daily.dates[best])}`;
}

test('the saved spec is Altair output in the site theme, reading the results file the page serves', () => {
  assert.match(spec.$schema, /vega-lite\/v6/);
  assert.equal(spec.usermeta.generator, 'charts/pld_daily.py');
  assert.match(spec.usermeta.altair, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(spec.data, { url: '/data/ccee-pld/results.json', format: { property: 'summary.daily', type: 'json' } });
  assert.doesNotMatch(JSON.stringify(spec), /"values"/, 'no data is copied into the spec');
  assert.equal(spec.config.background, '#f8f6f0');
  assert.match(spec.config.font, /^"Avenir Next"/);
  assert.equal(spec.config.line.color, '#4f5744');
});

test('it compiles with no warning, and names what the page sets', () => {
  assert.deepEqual(vega.usermeta.live, { day: 'day', key: 'dates', snap: 'line_marks', readout: 'readout_marks', params: ['period'] });
  const signal = (name) => vega.signals.find((s) => s.name === name);
  assert.equal(signal('period').value, 'all');
  assert.equal(signal('day').value, null);
  assert.equal(typeof signal('child_width').value, 'number', 'the page lays the panels out to its column');
  const marks = JSON.stringify(vega.marks);
  for (const name of ['line_marks', 'readout_marks']) assert.ok(marks.includes(`"name":"${name}"`), name);
});

test('drawn at build time: four panels on one scale, one point per saved day, peaks from the results', async () => {
  const { svg, width } = await renderStatic(vega, { width: 600 });
  const paths = lines(svg);
  assert.equal(paths.length, SUBMARKETS.length);
  for (const d of paths) assert.equal(pathPoints(d), daily.dates.length);
  const t = texts(svg);
  assert.deepEqual(t.filter((x) => x.includes(' · peak ')), SUBMARKETS.map((s) => peakTitle(s)));
  // Years along the bottom, and one y scale for all four panels: the same ticks four times.
  assert.deepEqual(t.filter((x) => /^20\d\d$/.test(x)), [...new Set(daily.dates.map((d) => d.slice(0, 4)))]);
  const yTicks = t.filter((x) => /^[\d,]+$/.test(x) && !/^20\d\d$/.test(x));
  assert.equal(yTicks.length % 4, 0);
  assert.deepEqual(yTicks.slice(0, yTicks.length / 4), yTicks.slice(yTicks.length / 4, yTicks.length / 2));
  assert.equal(yTicks[0], '0', 'the scale starts at zero');
  assert.ok(width > 600);
});

test('a period shows its own days and its own peaks', async () => {
  const { svg } = await renderStatic(vega, { width: 600, signals: { period: '2024' } });
  const days2024 = daily.dates.filter((d) => d.startsWith('2024')).length;
  assert.equal(days2024, 366);
  for (const d of lines(svg)) assert.equal(pathPoints(d), days2024);
  assert.deepEqual(texts(svg).filter((x) => x.includes(' · peak ')), SUBMARKETS.map((s) => peakTitle(s, '2024-01-01', '2024-12-31')));
});

test('pointing at a day draws the rule and the readout, with the four prices of that day', async () => {
  const day = '2024-07-22';
  const { svg } = await renderStatic(vega, { width: 600, signals: { day } });
  assert.equal((svg.match(/class="mark-rule role-mark /g) || []).length, 4);
  const i = daily.dates.indexOf(day);
  const { svg: none } = await renderStatic(vega, { width: 600 });
  assert.equal((none.match(/<line [^>]*stroke="#1a1a17"/g) || []).length, 0, 'no rule when no day is pointed at');
  assert.equal((svg.match(/<line [^>]*stroke="#1a1a17"/g) || []).length, 4);
  // The readout's values come from the tooltip encoding: check the spec formats each submarket.
  const readout = JSON.stringify(vega).match(/"tooltip":\{"signal":"([^"\\]|\\.)*"/)[0];
  for (const s of SUBMARKETS) assert.ok(readout.includes(`\\"${s}\\": format(datum[\\"${s}\\"], \\",.2f\\")`), s);
  assert.ok(Number.isFinite(daily.series.SUDESTE[i]));
});

test('a drawn chart laid out again at a new width shrinks to it once resized, as the page does', async () => {
  const { View, parse, textMetrics } = await import('vega');
  const { expressionInterpreter } = await import('vega-interpreter');
  const previous = textMetrics.width;
  textMetrics.width = textWidth; // as at build time; a browser measures its own text
  try {
    const view = new View(parse(vega, null, { ast: true }), { renderer: 'none', expr: expressionInterpreter, loader: siteLoader() });
    const width = async () => Number((await view.toSVG()).match(/width="(\d+)"/)[1]);
    view.signal('child_width', 650);
    await view.runAsync();
    const wide = await width();
    view.signal('child_width', 300).resize();
    await view.runAsync();
    assert.equal(wide - (await width()), 350);
    view.finalize();
  } finally {
    textMetrics.width = previous;
  }
});

test('the layout keeps its size: the axes and padding take the same room at any panel width', async () => {
  const a = await renderStatic(vega, { width: 300 });
  const b = await renderStatic(vega, { width: 650 });
  assert.equal(a.width - 300, b.width - 650);
  assert.equal(a.height, b.height);
  const c = await renderStatic(vega, { width: 300, signals: { day: daily.dates[0] } });
  const e = await renderStatic(vega, { width: 300, signals: { day: daily.dates[daily.dates.length - 1] } });
  assert.deepEqual([c.width, c.height], [a.width, a.height], 'pointing at the first day moves nothing');
  assert.deepEqual([e.width, e.height], [a.width, a.height], 'pointing at the last day moves nothing');
});

test('build-time data comes only from /data/ files saved with the site', async () => {
  const loader = siteLoader();
  assert.ok((await loader.load('/data/ccee-pld/results.json')).length > 1000);
  for (const bad of ['https://dadosabertos.ccee.org.br/x.csv', '/data/../package.json', 'data/ccee-pld/results.json', '/src/charts/pld-daily.vl.json']) {
    await assert.rejects(loader.load(bad), /only \/data\//, bad);
  }
});

test('relative paths put every point exactly where the rounded absolute path does', () => {
  const pts = Array.from({ length: 300 }, (_, i) => [i * 0.31, 40 + 20 * Math.sin(i / 7) - (i % 5) * 0.03]);
  const abs = 'M' + pts.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join('L');
  const rel = relativePolyline(abs);
  assert.ok(rel.length < abs.length * 0.8);
  const steps = rel.slice(1).split('l');
  const [x0, y0] = steps[0].split(',').map(Number);
  const back = [[x0, y0]];
  for (const pair of steps[1].match(/-?[\d.]+[,]?-?[\d.]+/g)) {
    const [dx, dy] = pair.match(/-?[\d.]+/g).map(Number);
    const [px, py] = back[back.length - 1];
    back.push([Math.round((px + dx) * 10) / 10, Math.round((py + dy) * 10) / 10]);
  }
  assert.deepEqual(back, abs.slice(1).split('L').map((p) => p.split(',').map(Number)));
  assert.equal(relativePolyline('M0,0L1,1'), 'M0,0L1,1', 'short paths stay as they are');
});

test('build-time text widths are close to the site sans, not Vega\'s 0.8 em fallback', () => {
  const w = textWidth({ fontSize: 12, fontWeight: 600 }, 'NORDESTE · peak 662 on 9 Oct 2024');
  assert.ok(w > 180 && w < 240, String(w));
  assert.equal(Math.round(textWidth({ fontSize: 11 }, '2024')), 24);
});

test('the figure: a drawing for wide columns and one for a 375 px phone, the compiled chart, buttons and a table', async () => {
  const html = await pldFigure(results, spec);
  const svgs = [...html.matchAll(/<svg [^>]*class="altair-svg" role="img" aria-label="([^"]+)"[^>]*>/g)];
  assert.equal(svgs.length, 2);
  const widths = [...html.matchAll(/<svg [^>]*width="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(widths, [WIDE, NARROW]);
  assert.equal(NARROW, 349, 'a 375 px phone: the column less the frame border');
  for (const [, label] of svgs) assert.ok(label.includes(`${longDate(results.summary.first)} to ${longDate(results.summary.last)}`));
  // No text under 11 px in either drawing, so the phone drawing reads at 375 px without zooming.
  for (const size of html.matchAll(/font-size="([\d.]+)px"/g)) assert.ok(Number(size[1]) >= 11, size[0]);
  // The compiled chart rides along as data the browser parses; nothing in it can close the element.
  const embedded = html.match(/<script type="application\/json" class="altair-spec">([^]*?)<\/script>/)[1];
  assert.doesNotMatch(embedded, /</);
  assert.deepEqual(JSON.parse(embedded), JSON.parse(JSON.stringify(vega)));
  // One button per year in the results, "All" pressed; disabled until the chart runs in the browser.
  const d = pldDaily(results);
  const buttons = [...html.matchAll(/<button type="button" data-param="period" data-value="([^"]+)" aria-pressed="(true|false)" disabled>([^<]+)<\/button>/g)];
  assert.deepEqual(buttons.map((b) => b[1]), ['all', ...d.years]);
  assert.deepEqual(buttons.map((b) => b[2]), ['true', ...d.years.map(() => 'false')]);
  assert.equal(buttons[0][3], `All, ${d.years[0]} to ${d.years[d.years.length - 1]}`);
  assert.match(html, new RegExp(`${d.days.toLocaleString('en-GB')} days, ${longDate(d.first)} to ${longDate(d.last)} · day level`));
  // The table view: one row per year, one column per submarket, as in the results.
  const se2024 = results.summary.yearly.find((r) => r.year === 2024 && r.submarket === 'SUDESTE').mean.toFixed(2);
  assert.match(html, new RegExp(`<tr><th scope="row">2024</th><td>${se2024}</td>`));
  assert.match(html, /Chart made with Altair in <code>charts\/pld_daily\.py<\/code>/);
});

test('in the browser: Vega runs with its interpreter, so the site needs no unsafe-eval', () => {
  const live = read('src/lib/charts/live.mjs');
  assert.match(live, /import\('vega-interpreter'\)/);
  assert.match(live, /parse\(spec, null, \{ ast: true \}\)/);
  assert.match(live, /expr: expressionInterpreter/);
  assert.match(live, /rootMargin: '400px 0px'/, 'it loads as the visitor nears the chart');
  // A new width lays the chart out again, and resize() lets it shrink as well as grow.
  assert.match(live, /view\.signal\('child_width', width\)\.resize\(\);/);
  const csp = read('public/_headers').match(/Content-Security-Policy: ([^\n]+)/)[1];
  assert.doesNotMatch(csp, /unsafe-eval/);
  // The tooltip is written with textContent, never as HTML.
  assert.doesNotMatch(live, /innerHTML/);
});

test('only the PLD page loads the chart script and its stylesheet', () => {
  const page = read('src/pages/lab/[slug].astro');
  assert.match(page, /\{isPld && <AltairCharts \/>\}/);
  assert.match(page, /\.\.\.\(isPld \? \['lab-pld', 'altair-charts'\] : \[\]\)/);
  assert.match(read('src/components/AltairCharts.astro'), /import \{ mountCharts \} from '\.\.\/lib\/charts\/live\.mjs';/);
  const css = read('public/css/altair-charts.css');
  assert.match(css, /@media \(max-width: 560px\) \{\n {2}\.altair-static--wide \{ display: none; \}\n {2}\.altair-static--narrow \{ display: block; \}/);
  assert.match(css, /\.altair-controls button \{[^}]*min-height: 36px/);
});
