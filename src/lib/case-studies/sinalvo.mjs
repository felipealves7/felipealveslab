// Figures for the sinalvo case study (/case-studies/sinalvo). Every number comes from
// data/sinalvo/figures.json; nothing here is typed by hand. The exhibits are drawn from these
// figures with the site's Altair charts (src/lib/charts/sinalvo.mjs). scripts/sinalvo-page.test.mjs
// checks the figures, the charts and the page text against the same file.

const nf = new Intl.NumberFormat('en-GB');
export const int = (n) => nf.format(n);
export const pct = (x, digits = 0) => `${(x * 100).toFixed(digits)}%`;

/** R$438k, R$1.0M: chart labels. */
export function brlShort(n) {
  if (n >= 1e6) return `R$${(n / 1e6).toFixed(1)}M`;
  return `R$${Math.round(n / 1e3)}k`;
}

/** R$438,000: running text. */
export const brlFull = (n) => `R$${int(n)}`;

const sum = (rows, key) => rows.reduce((t, r) => t + r[key], 0);

/** Throws if the recorded figures disagree with each other. */
export function checkFigures(f) {
  const fail = (msg) => { throw new Error(`sinalvo figures: ${msg}`); };
  const p = f.probe;
  if (f.synthetic !== false) fail('the case study uses recorded results, not synthetic data');
  if (sum(p.energyByModality, 'notices') !== p.energyNotices) fail('procurement types do not add up to the energy notices');
  if (sum(p.energyByWork, 'notices') !== p.energyNotices) fail('kinds of work do not add up to the energy notices');
  if (p.energyNotices >= p.notices) fail('energy notices must be a subset of all notices');
  if (p.keywordFalseMatches > p.energyNotices) fail('false matches exceed the matches');
  if (p.fileListTimeouts > p.fileListCalls) fail('timeouts exceed calls');
  const l = f.labels;
  if (l.direct + l.adjacent + l.noContest + l.discard !== l.rows) fail('label classes do not add up to the sample');
  const c = f.paymentRisk.capag;
  if (c.withGrade > c.formalTenders || c.lettersChanged > c.gradedBoth) fail('CAPAG counts out of range');
  if (c.formalTenders !== openTenders(f)) fail('CAPAG coverage is not measured on the open energy tenders');
  const t = f.paymentRisk.tceSp;
  if (sum(t.byGrade, 'towns') !== t.towns) fail('towns by grade do not add up');
  for (const g of t.byGrade) if (!(g.paidWithin30Days >= 0 && g.paidWithin30Days <= 1)) fail(`grade ${g.grade} share out of range`);
  const cRow = t.byGrade.find((g) => g.grade === 'C');
  if (!(cRow.low <= cRow.paidWithin30Days && cRow.paidWithin30Days <= cRow.high)) fail('grade C mean outside its range');
  const sectors = f.pncp90.sectors;
  if (!sectors.some((s) => s.key === 'energy')) fail('no energy sector');
  if (sum(sectors, 'formalTenders') > f.pncp90.formalTenders) fail('sector tenders exceed all formal tenders');
  if (f.labels.monthlyDirectEstimate > p.monthly.energyTenders) fail('direct estimate exceeds the monthly energy tenders');
  return true;
}

/** Energy notices that were open tenders (pregão or concorrência). */
export const openTenders = (f) => sum(f.probe.energyByModality.filter((m) => m.openTender), 'notices');

/** Figures quoted in the page's running text, computed from the data. */
export function derived(f) {
  checkFigures(f);
  const p = f.probe;
  const work = Object.fromEntries(p.energyByWork.map((w) => [w.key, w]));
  const open = openTenders(f);
  const sectorsByMedian = [...f.pncp90.sectors].sort((a, b) => b.medianFormalTender - a.medianFormalTender);
  return {
    notices90: int(f.pncp90.notices),
    energyNoticeShare90: f.pncp90.energyNoticesEstimate / f.pncp90.notices,
    energyMedian90: brlFull(f.pncp90.sectors.find((s) => s.key === 'energy').medianFormalTender),
    energyMedianRank: sectorsByMedian.findIndex((s) => s.key === 'energy') + 1,
    sectorCount: f.pncp90.sectors.length,
    weekNotices: int(p.notices),
    weekEnergy: int(p.energyNotices),
    weekEnergyShare: pct(p.energyNotices / p.notices, 1),
    weekOpen: int(open),
    weekOther: int(p.energyNotices - open),
    weekMedianTender: brlFull(p.medianEnergyTender),
    lightingShare: pct(work.lighting.notices / p.energyNotices),
    freeMarket: work['free-market'].notices,
    falseMatchOneIn: Math.round(p.energyNotices / p.keywordFalseMatches),
    pages: int(p.medianPagesPerPackage),
    tokensThousands: Math.round(p.medianTokensPerPackage / 1000),
    scanned: pct(p.scannedPageShare),
    fileLists: `${int(p.fileListTimeouts)} of ${int(p.fileListCalls)}`,
    fileListSeconds: Math.round(p.fileListMedianSeconds),
    capagCoverage: pct(f.paymentRisk.capag.withGrade / f.paymentRisk.capag.formalTenders),
    capagChanged: `${int(f.paymentRisk.capag.lettersChanged)} of ${int(f.paymentRisk.capag.gradedBoth)}`,
    capagChangedShare: pct(f.paymentRisk.capag.lettersChanged / f.paymentRisk.capag.gradedBoth, 1),
    siconfiFull: pct(f.paymentRisk.siconfi.fullReportShare),
    siconfiA: pct(f.paymentRisk.siconfi.paidByAugust.A),
    siconfiC: pct(f.paymentRisk.siconfi.paidByAugust.C),
    gradeCLow: pct(f.paymentRisk.tceSp.byGrade.find((g) => g.grade === 'C').low),
    gradeCHigh: pct(f.paymentRisk.tceSp.byGrade.find((g) => g.grade === 'C').high),
    oneGradeATown: pct(f.paymentRisk.tceSp.oneGradeATown),
    monthlyTenders: int(p.monthly.energyTenders),
  };
}

// ---------------------------------------------------------------------------------------------
// 1. Sectors over 90 days: how many formal tenders, and how large the median one is.
export function sectorChartData(f) {
  checkFigures(f);
  const rows = [...f.pncp90.sectors].sort((a, b) => b.formalTenders - a.formalTenders);
  const max = rows[0].formalTenders;
  return rows.map((s) => ({ ...s, share: s.formalTenders / max, focus: s.key === 'energy' }));
}

// ---------------------------------------------------------------------------------------------
// 2. One week of notices, zoomed: all notices, the energy slice by procurement type, then by work.
const WORK_TONES = { lighting: 'w1', substations: 'w2', efficiency: 'w3', solar: 'w4', 'free-market': 'w5' };

export function funnelChartData(f) {
  checkFigures(f);
  const p = f.probe;
  const open = openTenders(f);
  return {
    notices: p.notices,
    energy: p.energyNotices,
    energyShare: p.energyNotices / p.notices,
    open,
    other: p.energyNotices - open,
    work: p.energyByWork.map((w) => ({ ...w, share: w.notices / p.energyNotices, tone: WORK_TONES[w.key] })),
  };
}

// ---------------------------------------------------------------------------------------------
// 3. Payment timing by Treasury grade, from São Paulo's audit-court data.
export function paymentChartData(f) {
  checkFigures(f);
  return f.paymentRisk.tceSp.byGrade.map((g) => ({ ...g, ungraded: g.grade === 'No grade' }));
}

// ---------------------------------------------------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2026-08-05 -> 5 Aug */
export function short(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** 2026-11-01, 2026-11-07 -> 1 to 7 Nov; across two months -> 5 Aug to 2 Nov. */
export function span(from, to, sep = ' to ') {
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}${sep}${short(to)}`;
  return `${short(from)}${sep}${short(to)}`;
}

export function ordinal(n) {
  const words = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
  return words[n] ?? `${n}th`;
}
