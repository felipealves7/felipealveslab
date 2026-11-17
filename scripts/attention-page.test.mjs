// Pins the design figures on /lab/where-does-my-attention-go to the Worker's settings and the
// aggregation code, so a change to either fails here until the page is updated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wilson, ACTIVITIES, MIN_CELL } from '../pipelines/attention-pings/aggregate.mjs';
import { LATE_MINUTES } from '../pipelines/attention-pings/worker.mjs';
import { missingHeadings, extraSections, HUMAN_VARIABLE_HEADINGS } from './check-content.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const page = read('src/content/lab/where-does-my-attention-go.md');
const toml = read('pipelines/attention-pings/wrangler.toml');
const v = (k) => new RegExp(`^${k} = "([^"]*)"`, 'm').exec(toml)[1];
const saved = JSON.parse(read('data/attention/results.json'));

test('the page uses the six Human Variable sections in order', () => {
  assert.deepEqual(missingHeadings(page), []);
  assert.deepEqual(extraSections(page), []);
  assert.equal(HUMAN_VARIABLE_HEADINGS.length, 6);
});

test('the design on the page matches the Worker settings', () => {
  const days = (Date.parse(v('END_DATE')) - Date.parse(v('START_DATE'))) / 86400000 + 1;
  assert.equal(days, 22);
  const planned = days * Number(v('PINGS_PER_DAY'));
  assert.ok(page.includes(`from 1 to 22 December 2026: ${planned} planned`));
  assert.ok(page.includes(`a planned ${planned} pings`));
  assert.ok(page.includes(`Six a day at random times between 0${v('WINDOW_START_HOUR')}:00 and ${v('WINDOW_END_HOUR')}:00 local time (UTC+4), at least ${v('MIN_GAP_MINUTES')} minutes apart`));
  assert.equal(Number(v('TZ_OFFSET_MINUTES')), 240);
  assert.ok(page.includes(`${v('EXPIRE_MINUTES')} minutes from sending`));
  assert.ok(page.includes(`within ${LATE_MINUTES} minutes of its time`));
  assert.ok(page.includes(`(${ACTIVITIES.length} fixed categories)`));
  assert.ok(page.includes(`at least ${MIN_CELL} answers`));
  assert.ok(page.includes('runs every 5 minutes (288 runs a day)'));
  assert.match(toml, /crons = \["\*\/5 \* \* \* \*"\]/);
});

test('the stated interval width at 60 answers is what the code computes', () => {
  const [lo, hi] = wilson(30, 60);
  assert.equal(Math.round((hi - lo) * 100), 25);
  assert.ok(page.includes('With 60 answers, a 95% interval on a share is roughly 25 percentage points wide.'));
});

test('the test count on the page matches the test file', () => {
  const n = (read('pipelines/attention-pings/attention.test.mjs').match(/^test\(/gm) ?? []).length;
  assert.ok(page.includes(`${n} tests in \`pipelines/attention-pings/attention.test.mjs\``));
});

test('the page says no results while the saved file has none', () => {
  if (saved.summary.pings.sent === 0) {
    assert.ok(page.includes('### Results\n\nNone yet.'));
    assert.equal(saved.comparison, null);
  }
});
