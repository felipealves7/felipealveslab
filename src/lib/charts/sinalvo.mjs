// The Sinalvo case study's three exhibits, drawn with the site's Altair charts from
// data/sinalvo/figures.json: sectors (charts/bars.py), one week of notices zoomed in
// (charts/zoom.py, then its energy slice by kind of work in charts/bars.py) and payment by grade
// (charts/bars.py, with the spread for grade C). The figures come from src/lib/case-studies/sinalvo.mjs.
import { altairFigure, tableHtml } from './figure.mjs';
import { barsFigure } from './bars.mjs';
import { loadSpec } from './render.mjs';
import {
  sectorChartData, funnelChartData, paymentChartData, derived, int, pct, brlShort, brlFull, short, span, ordinal,
} from '../case-studies/sinalvo.mjs';

const SOURCE = 'Source: <code>data/sinalvo/figures.json</code>, results recorded in November 2026. Charts made with Altair in <code>charts/</code> and drawn when the site is built.';
const FIGURE = 'cs-figure';

export function sectorFigure(f) {
  const rows = sectorChartData(f);
  const d = derived(f);
  const energy = rows.find((s) => s.focus);
  return barsFigure({
    id: 'sector-chart',
    className: FIGURE,
    scaleMax: rows[0].formalTenders,
    rows: rows.map((s) => ({
      key: s.key,
      label: s.label,
      value: s.formalTenders,
      text: `${int(s.formalTenders)} · median ${brlShort(s.medianFormalTender)}`,
      focus: s.focus,
      readout: [s.label, [int(s.formalTenders), 'formal tenders, 90 days'], [brlFull(s.medianFormalTender), 'median estimated value']],
    })),
    title: 'Energy: the fewest tenders, among the largest',
    subtitle: `Formal tenders (pregão and concorrência) on PNCP, ${short(f.pncp90.from)} to ${short(f.pncp90.to)} 2026, and each sector's median estimated value. Sector counts are estimates from a weighted sample of ${int(f.pncp90.sample)} notices (about ±${pct(f.pncp90.sampleErrorLarge)} for large sectors, ±${pct(f.pncp90.sampleErrorEnergy)} for energy).`,
    label: `Formal tenders by sector over 90 days, with each sector's median estimated value. ${rows.map((s) => `${s.label}: ${int(s.formalTenders)} tenders, median ${brlShort(s.medianFormalTender)}`).join('; ')}. Energy and lighting has the fewest tenders and the ${ordinal(d.energyMedianRank)}-highest median of ${d.sectorCount} sectors.`,
    note: `${energy.label}, in ink: ${int(energy.formalTenders)} formal tenders, ${ordinal(d.energyMedianRank)}-highest median of ${d.sectorCount} sectors.`,
    hint: 'Hover or tap a bar for its sector.',
    table: tableHtml(['Sector', 'Formal tenders, 90 days', 'Median estimated value'], rows.map((s) => [s.label, int(s.formalTenders), brlFull(s.medianFormalTender)])),
    source: SOURCE,
  });
}

// The week as two bars: every notice with the energy slice, then the energy notices by type.
export function zoomRows(f) {
  const d = funnelChartData(f);
  const p = f.probe;
  const openShare = d.open / d.energy;
  return [
    {
      step: 1, key: 'other', start: 0, end: 1 - d.energyShare, tone: 'base',
      caption: `${int(d.notices)} notices, ${span(p.from, p.to, '–')} 2026`, value: `${int(d.energy)} energy (${pct(d.energyShare, 1)})`,
      readout: ['Every other notice', [int(d.notices - d.energy), `of ${int(d.notices)}`]],
    },
    {
      step: 1, key: 'energy', start: 1 - d.energyShare, end: 1, tone: 'focus', zoomFrom: 1 - d.energyShare, zoomTo: 1,
      readout: ['Matched the energy terms', [int(d.energy), `of ${int(d.notices)} (${pct(d.energyShare, 1)})`]],
    },
    {
      step: 2, key: 'open', start: 0, end: openShare, tone: 'focus',
      caption: `The ${int(d.energy)} energy notices, by procurement type`,
      readout: ['Open tenders (pregão or concorrência)', [int(d.open), `of ${int(d.energy)} (${pct(openShare)})`]],
    },
    {
      step: 2, key: 'not-open', start: openShare, end: 1, tone: 'muted',
      readout: ['Direct purchases, sole-source awards, accreditation', [int(d.other), `of ${int(d.energy)} (${pct(1 - openShare)})`]],
    },
  ];
}

export async function zoomFigure(f) {
  const d = funnelChartData(f);
  const p = f.probe;
  const openShare = d.open / d.energy;
  const keys = '<ul class="altair-keys">'
    + `<li><i class="altair-key altair-key--ink"></i>${int(d.open)} open tenders (pregão or concorrência)</li>`
    + `<li><i class="altair-key altair-key--pale"></i>${int(d.other)} direct purchases, sole-source awards or accreditation calls</li></ul>`;
  const zoom = await altairFigure({
    id: 'funnel-chart',
    className: FIGURE,
    vlSpec: loadSpec('zoom'),
    rows: { rows: zoomRows(f) },
    title: 'One week of tenders, zoomed in',
    subtitle: `Every notice PNCP published from ${span(p.from, p.to)} 2026 (${p.workingDays} working days), complete against the API's own totals. Energy = a notice whose object matched the agreed energy terms.`,
    label: `One week of PNCP notices, ${span(p.from, p.to)} 2026: ${int(d.notices)} notices, of which ${int(d.energy)} (${pct(d.energyShare, 1)}) matched the energy terms. Of those ${int(d.energy)}, ${int(d.open)} were open tenders and ${int(d.other)} were direct purchases, sole-source awards or accreditation calls.`,
    extra: keys,
    hint: 'Hover or tap a part of a bar for its count.',
    table: tableHtml(['Step', 'Notices', 'Share of the step above'], [
      ['All notices, every procurement method', int(d.notices), '–'],
      ['Matched the energy terms', int(d.energy), pct(d.energyShare, 1)],
      ['Energy: open tenders', int(d.open), pct(openShare)],
      ['Energy: direct purchases, sole-source, accreditation', int(d.other), pct(1 - openShare)],
    ]),
    source: SOURCE,
  });
  const work = await barsFigure({
    id: 'work-chart',
    className: FIGURE,
    scaleMax: d.energy,
    rows: d.work.map((w) => ({
      key: w.key,
      label: w.label,
      value: w.notices,
      text: `${int(w.notices)} · ${pct(w.share)}`,
      readout: [w.label, [int(w.notices), `of ${int(d.energy)} energy notices`]],
    })),
    title: `The same ${int(d.energy)}, by kind of work`,
    subtitle: `The energy notices of ${span(p.from, p.to)} 2026, by the work their object describes; the bars fill to the ${int(d.energy)}.`,
    label: `The ${int(d.energy)} energy notices by kind of work: ${d.work.map((w) => `${w.label} ${int(w.notices)}`).join(', ')}.`,
    hint: 'Hover or tap a bar for its count.',
    table: tableHtml(['Kind of work', 'Notices', 'Share of the energy notices'], d.work.map((w) => [w.label, int(w.notices), pct(w.share)])),
    source: SOURCE,
  });
  return zoom + work;
}

export function paymentFigure(f) {
  const rows = paymentChartData(f);
  const t = f.paymentRisk.tceSp;
  const towns = (n) => `${int(n)} town${n === 1 ? '' : 's'}`;
  return barsFigure({
    id: 'payment-chart',
    className: FIGURE,
    scaleMax: 1,
    rows: rows.map((g) => ({
      key: `grade-${g.grade}`,
      label: `${g.ungraded ? 'No grade' : `Grade ${g.grade}`} · ${towns(g.towns)}`,
      value: g.paidWithin30Days,
      text: g.low !== undefined ? `${pct(g.paidWithin30Days)} (towns ${pct(g.low)}–${pct(g.high)})` : pct(g.paidWithin30Days),
      lo: g.low,
      hi: g.high,
      readout: [`${g.ungraded ? 'No grade' : `Grade ${g.grade}`}, ${towns(g.towns)}`, [pct(g.paidWithin30Days), 'paid within 30 days, mean of towns'], ...(g.low !== undefined ? [[`${pct(g.low)}–${pct(g.high)}`, 'range across towns']] : [])],
    })),
    title: 'Paid within 30 days, by Treasury grade',
    subtitle: `${int(t.towns)} São Paulo towns that buy energy or were drawn to cover every grade: the mean share of company invoices paid within 30 days of the town confirming delivery. ${int(t.companyLiquidations)} company invoices from ${t.window}. Median time to pay: ${int(t.medianDaysToPay)} days.`,
    label: `Share of company invoices paid within 30 days, by Treasury CAPAG grade, ${int(t.towns)} São Paulo towns: ${rows.map((g) => `${g.grade} (${towns(g.towns)}) ${pct(g.paidWithin30Days)}${g.low !== undefined ? `, towns ranged ${pct(g.low)} to ${pct(g.high)}` : ''}`).join('; ')}.`,
    note: 'The line across a bar is the range across its towns. Grade D is a single town: read it as an example, not a rate.',
    hint: 'Hover or tap a bar for its grade.',
    table: tableHtml(['CAPAG grade', 'Towns', 'Paid within 30 days (mean of towns)'], rows.map((g) => [g.grade, int(g.towns), pct(g.paidWithin30Days) + (g.low !== undefined ? ` (towns ${pct(g.low)}–${pct(g.high)})` : '')])),
    source: SOURCE,
  });
}

