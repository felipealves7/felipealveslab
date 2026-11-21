// The /lab hub lists exhibits newest first and dates every claim about other platforms from the
// exhibit's check record. They read the page sources and data; they do not build the site.
// Run: node --test scripts/lab-hub-order.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const exhibits = readdirSync(new URL('../src/content/lab/', import.meta.url))
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'));
const field = (md, name) => {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)?.[1] ?? '';
  return new RegExp(`^${name}:\\s*["']?([^"'#\\n]+?)["']?\\s*(#.*)?$`, 'm').exec(fm)?.[1];
};

test('every exhibit has a published date, so the hub can list it in order', () => {
  assert.ok(exhibits.length > 0);
  for (const f of exhibits) {
    const md = read(`src/content/lab/${f}`);
    const published = field(md, 'published');
    assert.match(published ?? '', /^\d{4}-\d{2}-\d{2}$/, `${f} needs published: YYYY-MM-DD (the day the page first went live)`);
    const day = new Date(`${published}T00:00:00Z`);
    assert.ok(!Number.isNaN(day.getTime()) && day <= new Date(), `${f}: published ${published} is a real date, not in the future`);
  }
  assert.match(read('src/content/lab/_template.md'), /^published: \d{4}-\d{2}-\d{2}/m, 'the template carries the field');
});

test('the hub sorts by that date, newest first', () => {
  const hub = read('src/pages/lab/index.astro');
  assert.match(hub, /sort\(\(a, b\) => \(b\.data\.published\?\.getTime\(\) \?\? 0\) - \(a\.data\.published\?\.getTime\(\) \?\? 0\)\)/);
});

test('the Outside this site section takes every date from the check record', () => {
  const hub = read('src/pages/lab/index.astro');
  const section = hub.slice(hub.indexOf('lab-next-section'), hub.indexOf('</section>', hub.indexOf('lab-next-section')));
  assert.ok(section.length > 0);
  const months = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
  assert.doesNotMatch(section, new RegExp(`\\b\\d{1,2} (${months})[a-z]* 20\\d\\d\\b`), 'no date typed into the page');
  assert.match(section, /\{kaggleCheckedOn\}/);
  const ext = JSON.parse(read('data/aviation-reliability/external.json'));
  const recheck = ext.kaggle.rechecked;
  assert.match(recheck.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(recheck.date >= ext.checked, 'the re-check is not older than the first check');
  assert.ok(new Date(`${recheck.date}T00:00:00Z`) <= new Date(), 'the re-check is not in the future');
  assert.match(recheck.notebook, /^Public/);
  assert.match(recheck.dataset, /^Public/);
});
