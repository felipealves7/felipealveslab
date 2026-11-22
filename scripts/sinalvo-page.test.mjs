// The sinalvo case study quotes data/sinalvo/figures.json: the figures agree with each other, the page
// text and the home card quote them as recorded, and each chart draws every recorded value.
// They read the sources; they do not build the site.
// Run: node --test scripts/sinalvo-page.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  checkFigures, derived, openTenders, int, pct, brlFull, span,
  sectorChart, sectorChartData, funnelChart, funnelChartData, paymentChart, paymentChartData,
} from '../src/lib/case-studies/sinalvo.mjs';
import { SITE_PAGES } from '../src/lib/site-pages.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const figures = JSON.parse(read('data/sinalvo/figures.json'));
const source = read('src/pages/case-studies/sinalvo.astro');
const page = source.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const home = read('src/pages/index.astro');
const copy = () => JSON.parse(JSON.stringify(figures));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
// 2026-11-01, 2026-11-07 -> "1 to 7 November"
const dayRange = (from, to) => (from.slice(5, 7) === to.slice(5, 7)
  ? `${Number(from.slice(8))} to ${longDate(to)}` : `${longDate(from)} to ${longDate(to)}`);
const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

test('the recorded figures agree with each other', () => {
  assert.equal(checkFigures(figures), true);
  assert.equal(openTenders(figures), 87);
  const broken = copy();
  broken.probe.energyByModality[0].notices += 1;
  assert.throws(() => checkFigures(broken), /procurement types/);
  const towns = copy();
  towns.paymentRisk.tceSp.byGrade[0].towns += 1;
  assert.throws(() => checkFigures(towns), /towns by grade/);
  const labels = copy();
  labels.labels.discard -= 1;
  assert.throws(() => checkFigures(labels), /label classes/);
  const fake = copy();
  fake.synthetic = true;
  assert.throws(() => checkFigures(fake), /recorded results/);
});

test('the page text quotes the figures as recorded', () => {
  const f = figures;
  const d = derived(f);
  const p = f.probe;
  const l = f.labels;
  const dm = f.demand;
  const n = f.nextIdea;
  const k = f.killCriteria;
  const expected = [
    `${d.notices90} public notices`,
    `came to ${d.notices90}`,
    `about ${Math.round(d.energyNoticeShare90 * 100)}% of notices`,
    `a median of ${d.energyMedian90}`,
    `${f.models.scored} models scored`,
    'Seventeen business models',
    `fewer than ${k.signUps} free sign-ups`,
    `fewer than ${k.wouldPay} people saying they would pay, by week ${k.byWeek}`,
    `Gate 1 was set for ${longDate(k.gate1)}`,
    `${int(p.apiCalls)} API calls`,
    `${d.fileLists} calls timing out`,
    `a median of ${d.fileListSeconds} seconds`,
    `from ${dayRange(p.from, p.to)} 2026: ${d.weekNotices}`,
    `${d.weekEnergy} matched the energy terms (${d.weekEnergyShare})`,
    `${d.weekOpen} of those were open tenders`,
    `median estimated value of ${d.weekMedianTender}`,
    `Lighting and LED made up ${d.lightingShare} of the energy notices`,
    `${p.packagesRead} tender packages`,
    `a median of ${d.pages} pages, or about ${d.tokensThousands},000 tokens`,
    `${d.scanned} of pages scanned`,
    `about 1 in ${d.falseMatchOneIn} matches`,
    `${f.paymentRisk.buyers} public buyers`,
    `covered ${d.capagCoverage} of the energy tenders`,
    `${d.capagChanged} graded municipalities (${d.capagChangedShare}) changed letter`,
    `Among the ${d.siconfiFull} of buyers`,
    `had paid ${d.siconfiA} of the 2025 bills`,
    `for grade C it was ${d.siconfiC}`,
    `between ${d.gradeCLow} and ${d.gradeCHigh} of invoices within 30 days`,
    `one grade-A town paid ${d.oneGradeATown}`,
    `${l.rows}-row sample`,
    `a ${brlFull(l.ledBulbPurchase)} purchase of LED bulbs`,
    `about ${d.monthlyTenders} open energy tenders`,
    `roughly ${l.monthlyDirectEstimate} are direct energy work and about ${l.monthlyWithAdjacentEstimate}`,
    `from R$${f.competition.contrataxFromBrlPerMonth} a month`,
    `${dm.testCompaniesMin} to ${dm.testCompaniesMax} past winners`,
    `fewer than ${dm.stopIfFewerThan} in ${dm.outOf} showed interest`,
    `about US$${f.runningCostEstimateUsdPerMonth} a month`,
    `about ${n.newAppsPerMonthBefore} (August 2024 to July 2025) to about ${n.newAppsPerMonthAfter} (August to October 2026)`,
    `needed at least ${WORDS[n.cleanGapsRequired]} clean gaps`,
    `the typical new app had ${WORDS[n.medianInstallsNewApp]} install`,
    `About ${f.effort.hours} hours in one week`,
    `For ${f.paymentRisk.tceSp.towns} São Paulo towns, the probe measured payment timing`,
  ];
  for (const text of expected) assert.ok(page.includes(text), `page says "${text}"`);
  assert.equal(n.cleanGapsFound, 0);
  assert.match(page, /It had none\./);
  assert.equal(f.effort.moneySpent, 0);
  assert.match(page, /no money spent/);
  assert.equal(d.freeMarket, 0);
  assert.match(page, /The free electricity market, where my own experience sits, produced none\./);
  assert.equal(dm.buyerConversations, 0);
  assert.match(page, /No buyer was asked at any point\./);
});

test('eight checks ran and one did not, as the heading and the home card say', () => {
  const checks = source.match(/<li class="cs-check[ "]/g) ?? [];
  const gaps = source.match(/<li class="cs-check cs-check--gap"/g) ?? [];
  assert.equal(checks.length, 9);
  assert.equal(gaps.length, 1);
  const ran = checks.length - gaps.length;
  assert.match(page, new RegExp(`${WORDS[ran][0].toUpperCase()}${WORDS[ran].slice(1)} checks ran\\.`));
  assert.match(home, new RegExp(`<strong>${ran} checks</strong>`));
  const numbers = [...source.matchAll(/<span class="cs-check-n">(\d+)<\/span>/g)].map((m) => Number(m[1]));
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('the decision section counts its own findings', () => {
  const start = source.indexOf('<section class="case-section" id="decision">');
  const section = source.slice(start, source.indexOf('</section>', start));
  const cards = (section.match(/class="decision-card"/g) ?? []).length;
  const word = `${WORDS[cards][0].toUpperCase()}${WORDS[cards].slice(1)}`;
  assert.match(section, new RegExp(`<h2>${word} findings in one day`));
  assert.match(source, new RegExp(`<span>${word} findings, an investor-style review, build paused</span>`));
});

test('date spans read naturally within and across months', () => {
  assert.equal(span('2026-11-01', '2026-11-07'), '1 to 7 Nov');
  assert.equal(span('2026-11-01', '2026-11-07', '–'), '1–7 Nov');
  assert.equal(span('2026-08-05', '2026-11-02'), '5 Aug to 2 Nov');
});

test('the home card shows the same week, drawn to the same proportions', () => {
  const f = funnelChartData(figures);
  const card = home.slice(home.indexOf('href="/case-studies/sinalvo"'), home.indexOf('Read case study →</span></a>', home.indexOf('href="/case-studies/sinalvo"')));
  assert.ok(card.length > 0, 'home links the case study');
  const nums = [...card.matchAll(/<span class="sv-num">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(nums, [int(f.notices), int(f.energy), int(f.open)]);
  const w = (x) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;
  const bars = [...card.matchAll(/--w:([\d.]+%)/g)].map((m) => m[1]);
  assert.deepEqual(bars, [w(f.energyShare), w(f.open / f.energy), '100%']);
  const links = [...card.matchAll(/--from:([\d.]+%)/g)].map((m) => m[1]);
  assert.deepEqual(links, [w(1 - f.energyShare), w(1 - f.open / f.energy)]);
  assert.match(home, /<strong>Four pieces of work\. Same person\.<\/strong>/);
  assert.match(read('public/js/script.js'), /all:'Four pieces of work\. Same person\.'/);
  assert.equal((home.match(/class="case-card[ "]/g) ?? []).length, 4);
});

test('the sector chart draws every sector, longest bar first, energy highlighted', () => {
  const rows = sectorChartData(figures);
  const html = sectorChart(figures);
  assert.equal(rows.length, figures.pncp90.sectors.length);
  assert.equal(rows[0].share, 1);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].formalTenders <= rows[i - 1].formalTenders);
  for (const s of figures.pncp90.sectors) {
    assert.ok(html.includes(s.label.replace(/&/g, '&amp;')), `${s.label} labelled`);
    assert.ok(html.includes(`<span class="cs-sector-count">${int(s.formalTenders)}</span>`), `${s.label} count`);
  }
  const energy = rows.find((s) => s.key === 'energy');
  assert.match(html, /<div class="cs-sector is-focus"[^>]*><span class="cs-sector-label">Energy &amp; lighting<\/span>/);
  assert.ok(html.includes(`width:${(Math.round(energy.share * 1000) / 10).toFixed(1)}%`));
  assert.match(html, /third-highest median of 9 sectors/);
});

test('the zoom chart shows the week, the energy slice and what it was made of', () => {
  const d = funnelChartData(figures);
  const html = funnelChart(figures);
  for (const v of [d.notices, d.energy, d.open, d.other, ...d.work.map((w) => w.notices)]) {
    assert.ok(html.includes(`<strong>${int(v)}</strong>`), `${v} shown`);
  }
  assert.ok(html.includes('style="width:0.7%"'), 'energy sliver at 0.7% of the week');
  assert.ok(html.includes('--from:99.3%'), 'zoom starts at the sliver');
  const segs = [...html.matchAll(/cs-seg--w\d" style="width:([\d.]+)%"/g)].map((m) => Number(m[1]));
  assert.equal(segs.length, d.work.filter((w) => w.notices > 0).length);
  assert.ok(Math.abs(segs.reduce((a, b) => a + b, 0) - 100) < 0.11, 'kinds of work fill the bar');
  assert.match(html, /<li class="is-zero"><i class="cs-key cs-seg--w5"><\/i><span>Free electricity market<\/span><strong>0<\/strong>/);
});

test('the payment chart gives every grade its towns, and the range for grade C', () => {
  const rows = paymentChartData(figures);
  const html = paymentChart(figures);
  for (const g of rows) {
    assert.ok(html.includes(`<span class="cs-pay-value">${pct(g.paidWithin30Days)}</span>`), `grade ${g.grade} value`);
    assert.ok(html.includes(`${g.towns} town${g.towns === 1 ? '' : 's'}</span>`), `grade ${g.grade} towns`);
  }
  assert.ok(html.includes('class="cs-range" style="left:49.0%;width:51.0%"'));
  assert.match(html, /towns ranged 49%–100%/);
  assert.match(html, /Grade D is a single town/);
});

test('every chart is static HTML with a table view', () => {
  for (const html of [sectorChart(figures), funnelChart(figures), paymentChart(figures)]) {
    assert.doesNotMatch(html, /<script/i);
    assert.match(html, /role="img" aria-label="[^"]{80,}"/);
    assert.match(html, /<details class="cs-table"><summary>Show the numbers<\/summary><div class="cs-table-scroll"><table>/);
    assert.match(html, /<code>data\/sinalvo\/figures\.json<\/code>/);
  }
  assert.match(source, /import figures from '\.\.\/\.\.\/\.\.\/data\/sinalvo\/figures\.json'/);
  assert.match(source, /css=\{\[[^\]]*'case-charts'[^\]]*\]\}/);
});

test('the case study is in the sitemap list and linked from the home page', () => {
  assert.ok(SITE_PAGES.includes('/case-studies/sinalvo'));
  assert.match(home, /class="case-card reveal delay-3" data-tags="data product" href="\/case-studies\/sinalvo"/);
});
