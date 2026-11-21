// Every published Lab exhibit shows a chart on its /lab card, drawn at build time from its saved results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pldEvidence, dstEvidence } from '../src/lib/lab/evidence.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));
const hub = read('src/pages/lab/index.astro');
const start = hub.indexOf('const CHARTS');
const charted = [...hub.slice(start, hub.indexOf('};', start)).matchAll(/'([a-z0-9-]+)':\s*'[a-z]+'/g)].map((m) => m[1]);
const exhibits = readdirSync(new URL('../src/content/lab/', import.meta.url))
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .map((f) => f.replace(/\.md$/, ''));

test('every Lab exhibit has a chart on its /lab card', () => {
  assert.ok(exhibits.length > 0);
  for (const id of exhibits) {
    assert.ok(charted.includes(id), `add '${id}' to CHARTS in src/pages/lab/index.astro, with an evidence function in src/lib/lab/evidence.mjs`);
  }
});

test('the PLD card charts the saved SUDESTE yearly means', () => {
  const r = json('data/ccee-pld/results.json');
  const e = pldEvidence(r);
  const saved = r.summary.yearly.filter((y) => y.submarket === 'SUDESTE').sort((a, b) => a.year - b.year);
  assert.deepEqual(e.bars.map((b) => b.value), saved.map((y) => y.mean));
  assert.equal(Math.max(...e.bars.map((b) => b.percent)), 100);
  assert.match(e.bars.at(-1).label, /to date$/);
});

test('the clock-change card charts the saved rate ratios', () => {
  const r = json('data/dst-crashes/results.json');
  const e = dstEvidence(r);
  const pct = (x) => Number(((x.rateRatio - 1) * 100).toFixed(1));
  assert.deepEqual(e.bars.map((b) => Number(b.value.toFixed(1))), [r.eras[0], r.eras[1], r.standard].map(pct));
  assert.ok(e.diverging);
  assert.match(e.summary, new RegExp(`${((r.main.rateRatio - 1) * 100).toFixed(1)}% higher`));
});
