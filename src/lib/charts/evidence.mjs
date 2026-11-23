// The evidence chart of each Lab exhibit, on the Lab hub's cards and at the top of the airport and
// Ask the Ledger pages, drawn with the site's Altair charts from the summaries in
// src/lib/lab/evidence.mjs. Compact charts are drawn at card sizes and do not run live.
import { barsFigure } from './bars.mjs';
import { airportFigure } from './lab.mjs';
import { ledgerEvidence, airportEvidence, aviationEvidence, pldEvidence, dstEvidence } from '../lab/evidence.mjs';

const fmt = (value) => new Intl.NumberFormat('en-GB').format(value);
const BUILDERS = { ledger: ledgerEvidence, airport: airportEvidence, aviation: aviationEvidence, pld: pldEvidence, dst: dstEvidence };

// The summary (title, subtitle, source, sentence) and the chart's markup for one exhibit.
export async function evidenceChart(exhibit, data, { compact = false } = {}) {
  const build = BUILDERS[exhibit];
  if (!build) throw new Error(`Unknown Lab exhibit ${exhibit}`);
  const evidence = build(data);
  const id = `evidence-${exhibit}${compact ? '-card' : ''}`;
  const common = { id, tag: 'div', compact, label: evidence.title, hint: 'Hover or tap a bar for its value.' };
  if (exhibit === 'airport') {
    return { evidence, html: await airportFigure(data, { compact: true, tag: 'div', id, live: !compact }) };
  }
  const signed = Boolean(evidence.diverging);
  const largest = Math.max(...evidence.bars.map((b) => Math.abs(b.value)));
  const total = exhibit === 'ledger' ? evidence.bars.reduce((n, b) => n + b.value, 0) : undefined;
  const html = await barsFigure({
    ...common,
    signed,
    scaleMax: total ?? largest,
    rows: evidence.bars.map((b) => ({
      key: b.key,
      label: b.label,
      value: b.value,
      text: b.text ?? (total ? `${fmt(b.value)} of ${fmt(total)}` : fmt(b.value)),
      readout: [b.label, [b.text ?? `${fmt(b.value)} ${evidence.unit}`, total ? `of ${fmt(total)} ${evidence.unit}` : evidence.unit === '%' ? 'change' : evidence.unit]],
    })),
    label: `${evidence.title}. ${evidence.bars.map((b) => `${b.label}: ${b.text ?? `${fmt(b.value)} ${evidence.unit}`}`).join('; ')}.`,
  });
  return { evidence, html };
}
