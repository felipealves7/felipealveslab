// Lab pages on a 375 px phone: tables scroll inside their own box, long links wrap, the live box's
// controls are full-size tap targets, and the hidden attribute always hides.
// Run: node --test scripts/lab-prose.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { wrapTables, TABLE_SCROLL_CLASS } from '../src/lib/lab/prose.mjs';
import { fillLabCharts } from '../src/lib/lab/charts.mjs';
import { airportFigure, ledgerFigure } from '../src/lib/charts/lab.mjs';
import { pldFigure } from '../src/lib/charts/pld.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));
const count = (s, re) => (s.match(re) || []).length;

test('wrapTables puts every table in a labelled box that scrolls sideways, content unchanged', () => {
  const html = '<p>a</p><table><tr><td>1</td></tr></table><p>b</p><table class="x"><tr><td>2</td></tr></table>';
  const out = wrapTables(html);
  assert.equal(count(out, new RegExp(`<div class="${TABLE_SCROLL_CLASS}" role="region" aria-label="[^"]+" tabindex="0"><table`, 'g')), 2);
  assert.equal(count(out, /<\/table><\/div>/g), 2);
  assert.equal(out.replace(/<div class="lab-table-scroll"[^>]*>|<\/div>/g, ''), html);
  assert.equal(wrapTables('<p>no tables</p>'), '<p>no tables</p>');
});

test('wrapTables refuses nested or unbalanced tables', () => {
  assert.throws(() => wrapTables('<table><tr><td><table></table></td></tr></table>'), /Nested/);
  assert.throws(() => wrapTables('<table><tr><td>1</td></tr>'), /not closed/);
  assert.throws(() => wrapTables('</table>'), /no opening/);
});

test('the build-time charts, whose number tables open on tap, come out wrapped too', async () => {
  const pld = await pldFigure(json('data/ccee-pld/results.json'));
  const airport = await airportFigure(json('data/airport-contract/results.json'));
  const ledger = await ledgerFigure(json('data/ledger-eval/results.json'));
  const html = wrapTables(fillLabCharts('<div data-lab-chart="pld"></div><div data-lab-chart="airport"></div><div data-lab-chart="ledger"></div>', {
    pld: () => pld,
    airport: () => airport,
    ledger: () => ledger,
  }));
  assert.ok(count(html, /<table/g) >= 3);
  assert.equal(count(html, /<table/g), count(html, /<div class="lab-table-scroll"[^>]*><table/g));
});

test('every Lab page renders through wrapTables, so no Markdown table can be cut off on a phone', () => {
  const page = read('src/pages/lab/[slug].astro');
  assert.match(page, /import \{ wrapTables \} from '\.\.\/\.\.\/lib\/lab\/prose\.mjs'/);
  assert.match(page, /const body = wrapTables\(fillLabCharts\(/);
  assert.match(page, /<Fragment set:html=\{body\} \/>/);
  // Every exhibit has a Markdown or chart table the wrapper has to catch.
  const pages = readdirSync(new URL('../src/content/lab/', import.meta.url)).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  assert.ok(pages.length >= 5);
});

test('the Lab stylesheet scrolls wrapped tables, wraps long links and sizes the live box for touch', () => {
  const css = read('public/css/lab.css');
  assert.match(css, /\.lab-table-scroll\{overflow-x:auto/);
  assert.match(css, /\.lab-prose a\{overflow-wrap:anywhere\}/);
  for (const el of ['input', 'button']) assert.match(css, new RegExp(`#ledger-live ${el}\\{[^}]*min-height:44px`), `#ledger-live ${el} is at least 44 px tall`);
});

test('the hidden attribute always hides, on every page', () => {
  assert.match(read('public/css/site-fixes.css'), /\[hidden\]\{display:none!important\}/);
  const pages = ['src/pages/index.astro', 'src/pages/milestones.astro', 'src/pages/behind-the-scenes.astro', 'src/pages/404.astro', 'src/pages/lab/index.astro', 'src/pages/lab/[slug].astro', 'src/pages/lab/how-its-built.astro',
    ...readdirSync(new URL('../src/pages/case-studies/', import.meta.url)).map((f) => `src/pages/case-studies/${f}`)];
  for (const p of pages) assert.match(read(p), /'site-fixes'/, `${p} loads site-fixes.css`);
});
