// The sitemap lists every public page: the fixed pages in src/lib/site-pages.mjs and every Lab
// exhibit. They read the page sources; they do not build the site.
// Run: node --test scripts/sitemap.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_PAGES, sitemapXml } from '../src/lib/site-pages.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const pagesDir = join(root, 'src/pages');

function astroPages(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return astroPages(p);
    return name.endsWith('.astro') ? [p] : [];
  });
}

// src/pages/case-studies/sinalvo.astro -> /case-studies/sinalvo; lab/index.astro -> /lab.
const route = (file) => `/${relative(pagesDir, file).replace(/\.astro$/, '').replace(/(^|\/)index$/, '')}`.replace(/\/$/, '') || '/';
// Astro builds no page from a file whose name starts with an underscore: those pages are hidden.
const hidden = (file) => /(^|[\\/])_[^\\/]*\.astro$/.test(file);

test('every fixed page that is not a 404, a preview, hidden or a dynamic route is in the sitemap list', () => {
  const expected = astroPages(pagesDir)
    .filter((f) => !f.includes('['))
    .filter((f) => !hidden(f))
    .filter((f) => !/404\.astro$/.test(f))
    .filter((f) => !/\bnoindex\b/.test(readFileSync(f, 'utf8')))
    .map(route)
    .sort();
  assert.deepEqual([...SITE_PAGES].sort(), expected);
});

test('the sitemap is built by the site, so it cannot drift from the pages', () => {
  assert.equal(existsSync(join(root, 'public/sitemap.xml')), false, 'a hand-written public/sitemap.xml would shadow the built one');
  const endpoint = readFileSync(join(pagesDir, 'sitemap.xml.ts'), 'utf8');
  assert.match(endpoint, /getCollection\('lab'\)/);
  assert.match(endpoint, /\/lab\/\$\{entry\.id\}/);
  assert.match(readFileSync(join(root, 'public/robots.txt'), 'utf8'), /^Sitemap: https:\/\/felipealveslab\.com\/sitemap\.xml$/m);
});

test('the XML is well formed and uses full addresses without trailing slashes', () => {
  const exhibits = readdirSync(join(root, 'src/content/lab')).filter((f) => f.endsWith('.md') && !f.startsWith('_')).map((f) => `/lab/${f.replace(/\.md$/, '')}`);
  const xml = sitemapXml('https://felipealveslab.com', [...SITE_PAGES, ...exhibits]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, SITE_PAGES.length + exhibits.length);
  assert.equal(locs[0], 'https://felipealveslab.com/');
  for (const l of locs.slice(1)) assert.match(l, /^https:\/\/felipealveslab\.com\/[a-z0-9/-]+[a-z0-9]$/);
  assert.ok(locs.includes('https://felipealveslab.com/lab/spring-clock-change-road-deaths'));
});

test('a hidden case study keeps its old address working: a temporary redirect to the home page', () => {
  const redirects = readFileSync(join(root, 'public/_redirects'), 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
  for (const r of redirects) assert.equal(r.length, 3, `"${r.join(' ')}" is source, destination and status`);
  const hiddenCases = astroPages(join(pagesDir, 'case-studies')).filter(hidden)
    .map((f) => route(f).replace('/_', '/'));
  assert.ok(hiddenCases.length > 0);
  for (const path of hiddenCases) {
    assert.ok(!SITE_PAGES.includes(path), `${path} is not in the sitemap`);
    assert.deepEqual(redirects.find((r) => r[0] === path), [path, '/', '302'], `${path} redirects home with a 302`);
  }
});
