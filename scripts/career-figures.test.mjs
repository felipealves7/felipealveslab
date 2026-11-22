// Career figures read the same on every page that shows them: the home page, the case studies and
// the milestones. They read the page sources; they do not build the site.
// Run: node --test scripts/career-figures.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = (p) => readFileSync(new URL(`../src/pages/${p}`, import.meta.url), 'utf8')
  .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const home = text('index.astro');
const milestones = text('milestones.astro');
const aviation = text('case-studies/aviation-platform.astro');
const risk = text('case-studies/risk-analysis.astro');
// Hidden for now (the underscore keeps Astro from building it); its figures must still agree.
const einvoicing = text('case-studies/_einvoicing.astro');

test('BRS: 75 features, a five-year roadmap and two Scrum teams wherever they appear', () => {
  assert.match(home, /75 features authored during BRS discovery/);
  assert.match(aviation, /75 product features authored/);
  assert.match(milestones, /75 features/);
  for (const [name, page] of [['home', home], ['aviation case study', aviation], ['milestones', milestones]]) {
    assert.match(page, /5-year roadmap|five-year roadmap/, `${name}: five-year roadmap`);
    assert.match(page, /2 Scrum teams|two Scrum teams/, `${name}: two Scrum teams`);
  }
  assert.match(aviation, /82M\+/);
  assert.match(milestones, /82M\+/);
});

test('eInvoicing: 40+ applications wherever it appears, and the home page does not show it', () => {
  for (const [name, page] of [['hidden eInvoicing case study', einvoicing], ['milestones', milestones]]) {
    assert.match(page, /40\+ (applications|apps)\b/, `${name}: 40+ applications`);
    assert.doesNotMatch(page, /\b(30|35|45|50)\+ applications/, `${name}: one figure only`);
  }
  assert.doesNotMatch(home, /eInvoicing|\/case-studies\/einvoicing/, 'the home page has no eInvoicing card or metric');
});

test('Integrated Risk Analysis: a 32% fall in leverage, and Felipe led its delivery', () => {
  assert.match(home, /−32%/);
  assert.match(risk, /32% lower leverage|fell 32%/);
  assert.match(milestones, /−32% trading-agent leverage/);
  assert.match(risk, /I led its delivery end to end/);
  const year = milestones.slice(milestones.indexOf('2021–22'), milestones.indexOf('2021–22') + 400);
  assert.match(year, /Led delivery of an integrated market-risk framework/, 'the milestone says what the case study and CV say');
});
