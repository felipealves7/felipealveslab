// Build-time exhibits for the sinalvo case study (/case-studies/sinalvo).
// Every number comes from data/sinalvo/figures.json; nothing here is typed by hand. Each chart is
// plain HTML and CSS (public/css/case-charts.css), so its text stays readable at any width, and each
// one carries a table view with the exact numbers. scripts/sinalvo-page.test.mjs checks the figures,
// the charts and the page text against the same file.

const nf = new Intl.NumberFormat('en-GB');
export const int = (n) => nf.format(n);
export const pct = (x, digits = 0) => `${(x * 100).toFixed(digits)}%`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const width = (x) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;

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

function figure({ id, title, subtitle, plot, table, note }) {
  return `<figure class="cs-figure" id="${esc(id)}">`
    + `<figcaption class="cs-caption"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></figcaption>`
    + plot
    + (note ? `<p class="cs-note">${esc(note)}</p>` : '')
    + `<details class="cs-table"><summary>Show the numbers</summary>${table}</details>`
    + '<p class="cs-source">Source: <code>data/sinalvo/figures.json</code>, results recorded in November 2026 · drawn when the site is built.</p>'
    + '</figure>';
}

function tableHtml(head, rows) {
  const th = head.map((h) => `<th scope="col">${esc(h)}</th>`).join('');
  const tr = rows.map((cells) => `<tr><th scope="row">${esc(cells[0])}</th>${cells.slice(1).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<div class="cs-table-scroll"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------------------------
// 1. Sectors over 90 days: how many formal tenders, and how large the median one is.
export function sectorChartData(f) {
  checkFigures(f);
  const rows = [...f.pncp90.sectors].sort((a, b) => b.formalTenders - a.formalTenders);
  const max = rows[0].formalTenders;
  return rows.map((s) => ({ ...s, share: s.formalTenders / max, focus: s.key === 'energy' }));
}

export function sectorChart(f) {
  const rows = sectorChartData(f);
  const d = derived(f);
  const lines = rows.map((s) => `<div class="cs-sector${s.focus ? ' is-focus' : ''}" aria-hidden="true">`
    + `<span class="cs-sector-label">${esc(s.label)}</span>`
    + `<span class="cs-track"><span class="cs-fill" style="width:${width(s.share)}"></span></span>`
    + `<span class="cs-sector-count">${int(s.formalTenders)}</span>`
    + `<span class="cs-sector-median">${brlShort(s.medianFormalTender)}</span></div>`).join('');
  const energy = rows.find((s) => s.focus);
  const label = `Formal tenders by sector over 90 days, with each sector's median estimated value. `
    + rows.map((s) => `${s.label}: ${int(s.formalTenders)} tenders, median ${brlShort(s.medianFormalTender)}`).join('; ')
    + `. Energy and lighting has the fewest tenders and the ${ordinal(d.energyMedianRank)}-highest median of ${d.sectorCount} sectors.`;
  const plot = `<div class="cs-plot cs-sectors" role="img" aria-label="${esc(label)}">`
    + '<div class="cs-sector cs-sector-head" aria-hidden="true"><span class="cs-sector-label">Sector</span><span class="cs-track-head">Formal tenders</span><span class="cs-sector-count">Count</span><span class="cs-sector-median">Median</span></div>'
    + lines + '</div>';
  const table = tableHtml(['Sector', 'Formal tenders, 90 days', 'Median estimated value'],
    rows.map((s) => [s.label, int(s.formalTenders), brlFull(s.medianFormalTender)]));
  return figure({
    id: 'sector-chart',
    title: 'Energy: the fewest tenders, among the largest',
    subtitle: `Formal tenders (pregão and concorrência) on PNCP, ${short(f.pncp90.from)} to ${short(f.pncp90.to)} 2026, and each sector's median estimated value. Sector counts are estimates from a weighted sample of ${int(f.pncp90.sample)} notices (about ±${pct(f.pncp90.sampleErrorLarge)} for large sectors, ±${pct(f.pncp90.sampleErrorEnergy)} for energy).`,
    plot,
    table,
    note: `${energy.label}: ${int(energy.formalTenders)} formal tenders, ${ordinal(d.energyMedianRank)}-highest median of ${d.sectorCount} sectors.`,
  });
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

export function funnelChart(f) {
  const d = funnelChartData(f);
  const p = f.probe;
  const energyWidth = width(d.energyShare);
  const baseWidth = width(1 - d.energyShare);
  const openShare = d.open / d.energy;
  const workSegs = d.work.filter((w) => w.notices > 0)
    .map((w) => `<span class="cs-seg cs-seg--${w.tone}" style="width:${width(w.share)}"></span>`).join('');
  const workLegend = d.work.map((w) => `<li${w.notices === 0 ? ' class="is-zero"' : ''}><i class="cs-key cs-seg--${w.tone}"></i><span>${esc(w.label)}</span><strong>${int(w.notices)}</strong><em>${pct(w.share)}</em></li>`).join('');
  const label = `One week of PNCP notices, ${span(p.from, p.to)} 2026: ${int(d.notices)} notices, of which ${int(d.energy)} (${pct(d.energyShare, 1)}) matched the energy terms. `
    + `Of those ${int(d.energy)}, ${int(d.open)} were open tenders and ${int(d.other)} were direct purchases, sole-source awards or accreditation calls. `
    + `By kind of work: ${d.work.map((w) => `${w.label} ${int(w.notices)}`).join(', ')}.`;
  const plot = `<div class="cs-plot cs-zoom" role="img" aria-label="${esc(label)}">`
    + '<div class="cs-zoom-row" aria-hidden="true">'
    + `<p class="cs-zoom-label"><strong>${int(d.notices)}</strong> notices published, ${span(p.from, p.to, '–')} 2026</p>`
    + `<div class="cs-stack"><span class="cs-seg cs-seg--base" style="width:${baseWidth}"></span><span class="cs-seg cs-seg--focus cs-seg--sliver" style="width:${energyWidth}"></span></div>`
    + `<p class="cs-zoom-callout"><strong>${int(d.energy)}</strong> matched the energy terms (${pct(d.energyShare, 1)})</p>`
    + '</div>'
    + `<div class="cs-zoom-link" style="--from:${baseWidth}" aria-hidden="true"></div>`
    + '<div class="cs-zoom-row" aria-hidden="true">'
    + `<p class="cs-zoom-label">The <strong>${int(d.energy)}</strong> energy notices, by procurement type</p>`
    + `<div class="cs-stack"><span class="cs-seg cs-seg--focus" style="width:${width(openShare)}"></span><span class="cs-seg cs-seg--muted" style="width:${width(1 - openShare)}"></span></div>`
    + '<ul class="cs-legend">'
    + `<li><i class="cs-key cs-seg--focus"></i><span>Open tenders (pregão or concorrência)</span><strong>${int(d.open)}</strong></li>`
    + `<li><i class="cs-key cs-seg--muted"></i><span>Direct purchases, sole-source awards, accreditation</span><strong>${int(d.other)}</strong></li>`
    + '</ul></div>'
    + `<p class="cs-zoom-same" aria-hidden="true">The same ${int(d.energy)}, by kind of work</p>`
    + '<div class="cs-zoom-row" aria-hidden="true">'
    + `<div class="cs-stack">${workSegs}</div>`
    + `<ul class="cs-legend cs-legend--work">${workLegend}</ul>`
    + '</div></div>';
  const table = tableHtml(['Step', 'Notices', 'Share of the step above'], [
    ['All notices, every procurement method', int(d.notices), '–'],
    ['Matched the energy terms', int(d.energy), pct(d.energyShare, 1)],
    ['Energy: open tenders', int(d.open), pct(openShare)],
    ['Energy: direct purchases, sole-source, accreditation', int(d.other), pct(1 - openShare)],
    ...d.work.map((w) => [`Energy: ${w.label}`, int(w.notices), pct(w.share)]),
  ]);
  return figure({
    id: 'funnel-chart',
    title: 'One week of tenders, zoomed in',
    subtitle: `Every notice PNCP published from ${span(p.from, p.to)} 2026 (${p.workingDays} working days), complete against the API's own totals. Energy = a notice whose object matched the agreed energy terms.`,
    plot,
    table,
  });
}

// ---------------------------------------------------------------------------------------------
// 3. Payment timing by Treasury grade, from São Paulo's audit-court data.
export function paymentChartData(f) {
  checkFigures(f);
  return f.paymentRisk.tceSp.byGrade.map((g) => ({ ...g, ungraded: g.grade === 'No grade' }));
}

export function paymentChart(f) {
  const rows = paymentChartData(f);
  const t = f.paymentRisk.tceSp;
  const towns = (n) => `${int(n)} town${n === 1 ? '' : 's'}`;
  const lines = rows.map((g) => {
    const range = g.low !== undefined
      ? `<span class="cs-range" style="left:${width(g.low)};width:${width(g.high - g.low)}"></span>` : '';
    const rangeText = g.low !== undefined ? `<span class="cs-pay-range">towns ranged ${pct(g.low)}–${pct(g.high)}</span>` : '';
    return `<div class="cs-pay-row${g.ungraded ? ' is-ungraded' : ''}" aria-hidden="true">`
      + `<span class="cs-pay-label"><strong>${esc(g.ungraded ? 'No grade' : `Grade ${g.grade}`)}</strong><span>${towns(g.towns)}</span></span>`
      + `<span class="cs-track"><span class="cs-fill" style="width:${width(g.paidWithin30Days)}"></span>${range}</span>`
      + `<span class="cs-pay-value">${pct(g.paidWithin30Days)}</span>${rangeText}</div>`;
  }).join('');
  const label = `Share of company invoices paid within 30 days, by Treasury CAPAG grade, ${int(t.towns)} São Paulo towns: `
    + rows.map((g) => `${g.grade} (${towns(g.towns)}) ${pct(g.paidWithin30Days)}${g.low !== undefined ? `, towns ranged ${pct(g.low)} to ${pct(g.high)}` : ''}`).join('; ') + '.';
  const plot = `<div class="cs-plot cs-pay" role="img" aria-label="${esc(label)}">${lines}`
    + '<div class="cs-pay-axis" aria-hidden="true"><span></span><span class="cs-pay-ticks"><span>0%</span><span>50%</span><span>100%</span></span><span></span></div></div>';
  const table = tableHtml(['CAPAG grade', 'Towns', 'Paid within 30 days (mean of towns)'],
    rows.map((g) => [g.grade, int(g.towns), pct(g.paidWithin30Days) + (g.low !== undefined ? ` (towns ${pct(g.low)}–${pct(g.high)})` : '')]));
  return figure({
    id: 'payment-chart',
    title: 'Paid within 30 days, by Treasury grade',
    subtitle: `${int(t.towns)} São Paulo towns that buy energy or were drawn to cover every grade: the mean share of company invoices paid within 30 days of the town confirming delivery. ${int(t.companyLiquidations)} company invoices from ${t.window}. Median time to pay: ${int(t.medianDaysToPay)} days.`,
    plot,
    table,
    note: 'Grade D is a single town: read it as an example, not a rate.',
  });
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
