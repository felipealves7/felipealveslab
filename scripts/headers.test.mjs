// Tests for public/_headers (Cloudflare Pages response headers) and public/.well-known/security.txt.
// They read the files only; they do not call Cloudflare.
// Run: node --test scripts/headers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

// Blocks of "path" followed by indented "Name: value" lines, as Cloudflare Pages reads them.
export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { rules.push({ path: line.trim(), headers: {} }); continue; }
    const m = /^\s+([^:]+):\s*(.*)$/.exec(line);
    assert.ok(m && rules.length, `unreadable line: ${line}`);
    rules.at(-1).headers[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return rules;
}

const file = read('public/_headers');
const rules = parseHeaders(file);
const all = rules.find((r) => r.path === '/*');
const csp = Object.fromEntries(
  (all?.headers['content-security-policy'] ?? '').split(';').map((d) => d.trim()).filter(Boolean)
    .map((d) => { const [name, ...values] = d.split(/\s+/); return [name, values]; }),
);

test('the file stays within Cloudflare Pages limits', () => {
  assert.ok(rules.length > 0 && rules.length <= 100);
  for (const line of file.split(/\r?\n/)) assert.ok(line.length <= 2000, 'each line is at most 2,000 characters');
});

test('every page gets HTTPS-only, no framing and a restrictive policy', () => {
  assert.ok(all, 'there is a /* rule');
  const hsts = /max-age=(\d+)/.exec(all.headers['strict-transport-security'] ?? '');
  assert.ok(hsts && Number(hsts[1]) >= 15552000, 'HSTS lasts at least 180 days');
  assert.equal(all.headers['x-frame-options'], 'DENY');
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['base-uri'], ["'self'"]);
  assert.deepEqual(csp['default-src'], ["'self'"]);
  assert.doesNotMatch(all.headers['permissions-policy'] ?? '', /interest-cohort/, 'browsers log an error for this retired feature');
});

test('the policy allows the live box Worker, the airport results and files, and the Tableau embed the pages use', () => {
  const api = /data-api="([^"]+)"/.exec(read('src/content/lab/ask-the-ledger.md'))[1];
  assert.ok(csp['connect-src'].includes(new URL(api).origin), `connect-src allows ${api}`);
  const runs = /RUNS_URL = '([^']+)'/.exec(read('src/lib/airport/replay.mjs'))[1];
  assert.ok(csp['connect-src'].includes(new URL(runs).origin), `connect-src allows ${runs}`);
  // "Run it yourself" on the airport page downloads OurAirports' files in the browser with this URL.
  const files = /BASE_URL = '([^']+)'/.exec(read('pipelines/airport-contract/load.mjs'))[1];
  assert.ok(csp['connect-src'].includes(new URL(files).origin), `connect-src allows ${files}`);
  const tableau = new URL(JSON.parse(read('data/aviation-reliability/external.json')).tableau.embed.script).origin;
  for (const d of ['script-src', 'frame-src', 'img-src']) assert.ok(csp[d].includes(tableau), `${d} allows ${tableau}`);
});

test('Cache-Control is set once per folder, never for every path, and long only for hashed files', () => {
  assert.equal(all.headers['cache-control'], undefined, 'HTML keeps the Cloudflare default and revalidates');
  const cached = rules.filter((r) => r.headers['cache-control']);
  for (const r of cached) assert.match(r.path, /^\/[a-z_]+\/\*$/, `${r.path} is one folder`);
  assert.equal(new Set(cached.map((r) => r.path)).size, cached.length, 'no folder has two rules');
  for (const r of cached) {
    if (/immutable/.test(r.headers['cache-control'])) assert.equal(r.path, '/_astro/*', 'only Astro output has hashed names');
  }
});

test('security.txt names a contact and has not expired', () => {
  const txt = read('public/.well-known/security.txt');
  assert.match(txt, /^Contact: mailto:hello@felipealveslab\.com$/m);
  const expires = new Date(/^Expires: (.+)$/m.exec(txt)[1]);
  assert.ok(expires > new Date(), 'Expires is in the future; renew it before that date');
  assert.match(txt, /^Canonical: https:\/\/felipealveslab\.com\/\.well-known\/security\.txt$/m);
});
