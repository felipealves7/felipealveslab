// Tests for /lab/how-its-built, the page about how the Lab is built. They read the page source, the
// stylesheet and the saved results it quotes; they do not build the site and do not call GitHub.
// Run: node --test scripts/method-page.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkLinks } from './check-links.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');
const page = read('src/pages/lab/how-its-built.astro');
const css = read('public/css/lab-methodology.css');
const body = page.slice(page.indexOf('<Base'));

test('the page is a static route, not an experiment in the content collection', () => {
  assert.ok(existsSync(root + 'src/pages/lab/how-its-built.astro'));
  assert.equal(existsSync(root + 'src/content/lab/how-its-built.md'), false);
});

test('the Lab hub and the footer link to it, and every internal reference resolves', () => {
  assert.match(read('src/components/SiteFooter.astro'), /href="\/lab\/how-its-built"/);
  assert.match(read('src/pages/lab/index.astro'), /href="\/lab\/how-its-built"/);
  assert.deepEqual(checkLinks(root).filter((p) => p.includes('how-its-built') || p.includes('lab-methodology')), []);
});

test('the footer keeps its existing links', () => {
  const footer = read('src/components/SiteFooter.astro');
  assert.match(footer, /mailto:felipe\.s\.alves7@gmail\.com/);
  assert.match(footer, /href="\/behind-the-scenes"/);
  assert.match(footer, /linkedin\.com\/in\/felipealves7/);
});

test('the numbers it quotes come from the saved results, and those still say what the page says', () => {
  assert.match(page, /import airport from '\.\.\/\.\.\/\.\.\/data\/airport-contract\/results\.json'/);
  assert.match(page, /import ledger from '\.\.\/\.\.\/\.\.\/data\/ask-the-ledger\/results\.json'/);
  const airport = JSON.parse(read('data/airport-contract/results.json'));
  const ledger = JSON.parse(read('data/ask-the-ledger/results.json'));
  assert.equal(airport.runs.at(-1).checks.length, 19);
  assert.equal(ledger.summary.correct_answer + ledger.summary.correct_refusal, 40);
  assert.equal(ledger.summary.total, 47);
  assert.equal(ledger.translator.includes('no language model'), true);
  // The prose must not hard-code what the data supplies.
  assert.doesNotMatch(body, /\b19 written rules\b/);
  assert.doesNotMatch(body, /\b40 of 47\b/);
});

test('every claim from GitHub is dated, and the date is stated once', () => {
  assert.equal(page.match(/const CHECKED = '[^']+';/g)?.length, 1);
  assert.match(page, /const CHECKED = '2 November 2026';/);
  assert.ok((body.match(/\{CHECKED\}/g) ?? []).length >= 3);
});

test('external links go only to this repository on github.com and open safely', () => {
  assert.match(page, /const REPO = 'https:\/\/github\.com\/felipealves7\/felipealveslab';/);
  const literal = [...body.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(literal, []);
  for (const tag of body.match(/<a [^>]*target="_blank"[^>]*>/g) ?? []) assert.match(tag, /rel="noreferrer"/);
  assert.ok(!/href=\{[^}]*(?:http|\/\/)/.test(body.replace(/\$\{REPO\}/g, '')));
});

test('no hype words, no claim of autonomy or production readiness', () => {
  const banned = /production-ready|enterprise-grade|fully autonomous|self-healing|always-on|multi-agent system|best-in-class|cutting-edge|revolutionary/i;
  assert.doesNotMatch(body, banned);
  assert.doesNotMatch(css, banned);
});

test('no chat, session or credential material', () => {
  for (const text of [page, css]) {
    assert.doesNotMatch(text, /claude\.ai\/code|session_[0-9A-Za-z]{8,}|Claude-Session/);
    assert.doesNotMatch(text, /sk-ant-|ghp_|github_pat_|CF_AI_TOKEN|CF_API_TOKEN|api[_-]?key/i);
  }
});

test('headings: one h1, and every labelled section points at a heading that exists', () => {
  assert.equal((body.match(/<h1[ >]/g) ?? []).length, 1);
  for (const [, id] of body.matchAll(/aria-labelledby="([^"]+)"/g)) {
    assert.match(body, new RegExp(`<h[12] id="${id}"`), `${id} should label a heading`);
  }
  const ids = [...body.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
});

test('the controls table has a caption, column headers, row headers and a label on every cell', () => {
  const table = body.slice(body.indexOf('<table'), body.indexOf('</table>'));
  assert.match(table, /<caption/);
  assert.equal((table.match(/<th scope="col">/g) ?? []).length, 4);
  const rows = table.slice(table.indexOf('<tbody>')).split('<tr>').slice(1);
  assert.equal(rows.length, 9);
  for (const row of rows) {
    assert.equal((row.match(/<th scope="row" data-label="Control">/g) ?? []).length, 1);
    assert.equal((row.match(/<td data-label="[^"]+">/g) ?? []).length, 3);
    assert.match(row, /class="method-status is-(?:enforced|policy|auto|seen|none)"/);
  }
});

test('each status word means one thing and is explained under the table', () => {
  const words = [...body.matchAll(/class="method-status is-[a-z]+">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual([...new Set(words)].sort(), ['Automated', 'Enforced', 'Not observed', 'Observed', 'Policy only']);
  for (const w of ['Enforced', 'Automated', 'Policy only', 'Observed', 'Not observed']) {
    assert.match(body, new RegExp(`<strong>${w}:</strong>`));
  }
});

test('the human gate is described as policy, not as something GitHub enforces', () => {
  assert.match(body, /GitHub does not enforce it/);
  assert.match(body, /It requires no approving review/);
});

test('the stylesheet adds no fonts, imports or remote assets and respects the existing tokens', () => {
  assert.doesNotMatch(css, /@import|@font-face|url\(/);
  assert.match(css, /var\(--olive2\)/);
  assert.match(css, /clip-path:inset\(50%\)/, 'the table header stays available to screen readers on narrow screens');
});

test('the page adds no script of its own', () => {
  assert.doesNotMatch(body, /<script/);
  assert.match(body, /script="script"/);
});
