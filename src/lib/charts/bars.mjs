// The site's bar chart (charts/bars.py): rows checked here, then drawn by figure.mjs. One design for
// every bar on the site; "signed" draws changes left and right of a centre line.
import { altairFigure } from './figure.mjs';
import { loadSpec } from './render.mjs';

// rows: { key, label, value, text, readout, focus?, lo?, hi? }; scaleMax: the whole track's length
// (for signed bars, each side's). Returns the rows the chart takes, in the order given.
export function barRows(rows, { scaleMax, signed = false }) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('A bar chart needs rows');
  if (!(scaleMax > 0)) throw new Error('A bar chart needs a positive scale');
  const keys = new Set();
  return rows.map((r, order) => {
    if (!r.key || keys.has(r.key)) throw new Error(`Bar keys must be present and unique: ${r.key}`);
    keys.add(r.key);
    if (!Number.isFinite(r.value) || (!signed && r.value < 0) || Math.abs(r.value) > scaleMax * (1 + 1e-9)) {
      throw new Error(`Bar ${r.key} is off its scale`);
    }
    if (typeof r.label !== 'string' || typeof r.text !== 'string') throw new Error(`Bar ${r.key} lacks its label or value text`);
    const out = { key: r.key, order, label: r.label, value: r.value, scaleMax, text: r.text, readout: r.readout ?? { [r.label]: r.text }, focus: Boolean(r.focus) };
    if (r.lo !== undefined || r.hi !== undefined) {
      if (!(r.lo <= r.value && r.value <= r.hi)) throw new Error(`Bar ${r.key}: the range should hold the value`);
      Object.assign(out, { lo: r.lo, hi: r.hi });
    }
    return out;
  });
}

export function barsFigure({ rows, scaleMax, signed = false, ...figure }) {
  return altairFigure({ ...figure, vlSpec: loadSpec(signed ? 'bars-change' : 'bars'), rows: { rows: barRows(rows, { scaleMax, signed }) } });
}
