// The shutdown test on /lab/aviation-reliability quotes data/aviation-shutdown/results.json and the daily
// file behind it: every figure in the section is pinned here. They read the files; they do not build the site.
// Run: node --test scripts/aviation-shutdown-page.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readDaily, rates } from '../pipelines/aviation-shutdown/analyse.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const r = JSON.parse(read('data/aviation-shutdown/results.json'));
const extract = JSON.parse(read('data/aviation-shutdown/extract.json'));
const daily = readDaily(read('data/aviation-shutdown/daily-exposure.csv'));
const page = read('src/content/lab/aviation-reliability.md');
const start = page.indexOf('### The shutdown test');
const section = page.slice(start, page.indexOf('## Known limits'));
const P = Object.fromEntries(r.periods.map((p) => [p.key, p]));
const n = (x) => Math.round(x).toLocaleString('en-US');
const pct = (x) => `${(x * 100).toFixed(2)}%`;
const pts = (x) => x.toFixed(2);
const rate = (t) => `${pct(t.cancellation_rate)} (${n(t.cancelled)} of ${n(t.scheduled)})`;
const has = (text) => assert.ok(section.includes(text), `the section says: ${text}`);

test('the section sits in Method and results and names its data', () => {
  assert.ok(start > page.indexOf('## Method and results') && start < page.indexOf('## Known limits'));
  has(`${n(extract.rows_total)} scheduled flights`);
  assert.equal(P.order.from, '2025-11-07');
  assert.equal(P.order.to, '2025-11-16');
  assert.equal(P.order.days, 10);
});

test('every cell of the cancellation table comes from results.json', () => {
  const rows = { both: 'Listed airport at both ends', one: 'Listed airport at one end', none: 'No listed airport' };
  for (const [g, label] of Object.entries(rows)) {
    const line = section.split('\n').find((l) => l.startsWith(`| ${label} |`));
    assert.equal(line, `| ${label} | ${rate(P.shutdown[g])} | ${rate(P.order[g])} | ${rate(P.after[g])} |`);
  }
});

test('each finding quotes its figures from results.json', () => {
  const did = Object.fromEntries(r.difference_in_differences.map((d) => [d.group, d]));
  has(`rose ${pts(did.both.change_pp)} points on routes with a listed airport at both ends and ${pts(did.one.change_pp)} points at one end, against ${pts(did.both.comparison_change_pp)} points`);
  has(`differences of ${pts(did.both.difference_pp)} and ${pts(did.one.difference_pp)} points`);
  has(`${pct(P.order.all.nas_share_of_cancellations)} of cancellations carried the National Aviation System code, against ${pct(P.shutdown.all.nas_share_of_cancellations)}`);
  const sched = Object.fromEntries(r.scheduled_against_weekday.map((s) => [s.group, s]));
  assert.ok(sched.both.change < 0 && sched.one.change < 0, 'scheduled flights fell');
  has(`${pct(-sched.both.change)} (both ends) and ${pct(-sched.one.change)} (one end) below`);
  has(`went from ${pct(P.shutdown.all.cancellation_rate)} to ${pct(P.order.all.cancellation_rate)}, almost ten times`);
  const times = P.order.all.cancellation_rate / P.shutdown.all.cancellation_rate;
  assert.ok(times >= 9.5 && times < 10, `"almost ten times" is ${times.toFixed(2)}`);
  has(`went from ${pts(P.shutdown.all.mean_signed_delay)} to ${pts(P.order.all.mean_signed_delay)} minutes`);
  const lod = r.level_of_detail;
  has(`November 2025 cancelled ${pct(lod.november.cancellation_rate)} of flights (${n(lod.november.cancelled)} of ${n(lod.november.scheduled)})`);
  assert.equal(lod.peak_day.date, '2025-11-09');
  has(`9 November cancelled ${rate(lod.peak_day)}`);
  const cut = Object.fromEntries(r.by_cut.map((c) => [c.cut, c.exposed]));
  has(`${pct(cut[4].cancellation_rate)} were cancelled on the 4% days, ${pct(cut[6].cancellation_rate)} on the 6% days and ${pct(cut[3].cancellation_rate)} on the 3% days`);
  const limits = page.slice(page.indexOf('## Known limits'), page.indexOf('## How it was built'));
  assert.ok(limits.includes(`Routes between two unlisted airports are few: ${n(P.order.none.scheduled)} flights over the ten order days.`));
});

test('the three worst order days for flights touching a listed airport are 8 to 10 November', () => {
  const days = [...new Set(daily.filter((d) => d.cut > 0).map((d) => d.date))].map((date) => ({
    date, rate: rates(daily.filter((d) => d.date === date && d.exposure !== 'none')).cancellation_rate,
  }));
  const worst = days.sort((a, b) => b.rate - a.rate).slice(0, 3).map((d) => d.date).sort();
  assert.deepEqual(worst, ['2025-11-08', '2025-11-09', '2025-11-10']);
  assert.ok(worst.every((d) => daily.find((x) => x.date === d).cut === 4), 'all in the 4% step');
  has('The three worst days, 8 to 10 November, all fell in the 4% step.');
});
