// Pins the figures on /lab/spring-clock-change-road-deaths to data/dst-crashes/results.json, so a
// rerun that changes a number fails here until the page is updated. Also checks the chart in the
// page is the one the code draws from the saved results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heroBlock, START, END } from '../pipelines/dst-crashes/chart.mjs';
import { headingsFor, missingHeadings, HUMAN_VARIABLE_HEADINGS } from './check-content.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const r = JSON.parse(read('data/dst-crashes/results.json'));
const page = read('src/content/lab/spring-clock-change-road-deaths.md');
const int = (n) => n.toLocaleString('en-US');
const n3 = (x) => x.toFixed(3);
const iv = (e) => `${n3(e.interval95[0])} to ${n3(e.interval95[1])}`;
const has = (s) => assert.ok(page.includes(s), `page should include: ${s}`);

test('the page uses the six Human Variable sections', () => {
  assert.deepEqual(headingsFor(page), HUMAN_VARIABLE_HEADINGS);
  assert.deepEqual(missingHeadings(page), []);
});

test("Felipe's two sections are written and quote the saved figures", () => {
  assert.doesNotMatch(page, /Felipe writes this section\./);
  const m = r.main;
  const below = r.perYear.filter((y) => y.rateRatio < 1);
  has(`about ${Math.round((m.rateRatio - 1) * 100)}% higher`);
  has(`roughly ${Math.round(m.excessDeathsPerYear)} deaths a year`);
  has(`about ${Math.round(m.excessDeathsPerYear)} lives to a country`);
  has(`${below.length} of ${r.perYear.length} years show no rise`);
});

test('the chart in the page is drawn from the saved results, inside The Experiment', () => {
  const a = page.indexOf(START);
  const b = page.indexOf(END) + END.length;
  assert.equal(page.slice(a, b), heroBlock(r));
  assert.ok(a > page.indexOf('## The Experiment') && b < page.indexOf('## What Surprised Me'));
  assert.ok(!/\n\s*\n/.test(page.slice(a, b)), 'no blank line inside the SVG block');
});

test('headline figures', () => {
  const m = r.main;
  has(`rate ratio ${n3(m.rateRatio)}, 95% interval ${iv(m)}`);
  has(`${int(m.treat)} crashes on ${m.treatDays} work-week days against ${int(m.control)} on ${m.controlDays} comparison days`);
  has(`about ${Math.round(m.excessPerYear)} extra fatal crashes a year (interval ${Math.round(m.excessInterval95[0])} to ${Math.round(m.excessInterval95[1])})`);
  has(`${Math.round(m.excessDeathsPerYear)} extra deaths a year (interval ${Math.round(m.excessDeathsInterval95[0])} to ${Math.round(m.excessDeathsInterval95[1])})`);
  has(`${((m.rateRatio - 1) * 100).toFixed(1)}% higher`);
});

test('comparison table rows', () => {
  for (const e of [...r.eras.slice(0, 2), r.standard, ...r.placebos]) {
    has(`| ${int(e.treat)} on ${e.treatDays} days | ${int(e.control)} on ${e.controlDays} days | ${n3(e.rateRatio)} (${iv(e)}) |`);
  }
  has(`${n3(r.did.ratio)} (${iv(r.did)})`);
  has(`2007–2015: ${n3(r.eras[2].rateRatio)} (${iv(r.eras[2])})`);
  has(`2016–2024 without 2020: ${n3(r.eras[3].rateRatio)} (${iv(r.eras[3])})`);
});

test('level of detail, sun join and replication figures', () => {
  const [am, pm] = r.timeOfDay;
  has(`${n3(am.rateRatio)} (${iv(am)}), ${int(am.treat)} against ${int(am.control)}`);
  has(`${n3(pm.rateRatio)} (${iv(pm)}), ${int(pm.treat)} against ${int(pm.control)}`);
  const [day, dark] = r.sun;
  has(`sun up rose ${n3(day.rateRatio)} (${iv(day)})`);
  has(`${n3(dark.rateRatio)} (${iv(dark)})`);
  const below = r.perYear.filter((y) => y.rateRatio < 1);
  has(`${below.length} of ${r.perYear.length} years are below 1.0`);
  const lo = r.perYear.reduce((a, b) => (b.rateRatio < a.rateRatio ? b : a));
  const hi = r.perYear.reduce((a, b) => (b.rateRatio > a.rateRatio ? b : a));
  has(`ranges from ${n3(lo.rateRatio)} (${lo.year}) to ${n3(hi.rateRatio)} (${hi.year})`);
  const post = r.chart.post.filter((d) => d.offset >= 1 && d.offset <= 5).map((d) => d.index);
  has(`${n3(Math.min(...post))} to ${n3(Math.max(...post))} each day since 2007`);
  const [fritz, smith] = r.replication;
  has(`${n3(fritz.rateRatio)} (${iv(fritz)}); ${Math.round(fritz.excessDeathsPerYear)} deaths a year`);
  has(`${n3(smith.rateRatio)} (${iv(smith)}); ${Math.round(smith.excessDeathsPerYear)} deaths a year`);
  has(`With 2020 the main ratio is ${n3(r.with2020.rateRatio)} (${iv(r.with2020)})`);
  const s = r.symmetric;
  has(`main ratio becomes ${n3(s.main.rateRatio)} (${iv(s.main)}), the April placebo ${n3(s.placeboPost.rateRatio)} (${iv(s.placeboPost)}), the March change ${n3(s.post.rateRatio)} (${iv(s.post)}) and the April change ${n3(s.pre.rateRatio)} (${iv(s.pre)})`);
});

test('data counts and checks', () => {
  const d = r.data;
  has(`${int(d.rows)} crash records, ${int(d.deaths)} deaths`);
  has(`${d.droppedUnknownDate} records with an unknown month or day`);
  has(`${int(d.sunJoined)} of ${int(d.crashWindowPairs)} crash-window records`);
  has(`${int(d.sunAgreement.agree)} of ${int(d.sunAgreement.both)} agree`);
  has(`(${((d.sunAgreement.agree / d.sunAgreement.both) * 100).toFixed(1)}%)`);
  has(`The ${int(d.sunAgreement.both - d.sunAgreement.agree)} misses`);
  has(`every one of the ${int(d.crashes)} kept records`);
  const cols = d.layouts.map((l) => l.columns);
  has(`${Math.min(...cols)} to ${Math.max(...cols)} columns`);
  has(`about ${Math.round(r.standard.control / r.standard.nYears)} fatal crashes on the 15 comparison days`);
});
