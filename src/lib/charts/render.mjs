// Build-time rendering of the site's Altair charts (charts/*.py → src/charts/<name>.vl.json).
// compileChart() turns a Vega-Lite spec into Vega; withRows() hands it the rows the page built
// from its saved results; renderStatic() draws it to SVG in Node, reading files only from those
// the site serves under /data/. The browser runs the same compiled spec (src/lib/charts/live.mjs),
// so the picture with no JavaScript and the live chart share one layout.
import * as vl from 'vega-lite';
import { View, parse, loader as vegaLoader, textMetrics } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { readFileSync } from 'node:fs';

const ROOT = `file://${process.cwd().replace(/\/$/, '')}/`;
const PUBLIC = new URL('public/', ROOT);

// A chart's saved Vega-Lite spec, as charts/build.py wrote it.
export function loadSpec(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Bad chart name ${name}`);
  return JSON.parse(readFileSync(new URL(`src/charts/${name}.vl.json`, ROOT), 'utf8'));
}

// The width the page lays out: each panel's in a faceted chart, the plot's otherwise.
export const widthSignal = (vega) => (vega.signals ?? []).some((s) => s.name === 'child_width') ? 'child_width' : 'width';

// Fill the data sources a chart names in usermeta.rows (charts/theme.rows) with the rows the page
// built from its saved results. Every one must be filled, and nothing else may be.
export function withRows(vega, rows = {}) {
  const out = structuredClone(vega);
  const expected = out.usermeta?.rows ?? [];
  for (const name of Object.keys(rows)) if (!expected.includes(name)) throw new Error(`The chart takes no rows called "${name}"`);
  for (const name of expected) {
    const d = (out.data ?? []).find((x) => x.name === name);
    if (!d) throw new Error(`The compiled chart has no data source "${name}"`);
    if (!Array.isArray(rows[name]) || rows[name].length === 0) throw new Error(`No rows for the chart's data source "${name}"`);
    d.values = rows[name];
  }
  return out;
}

// Compile, refusing any warning: a warning means Vega-Lite dropped or changed part of the spec.
export function compileChart(spec) {
  const warnings = [];
  const logger = { level() { return logger; }, error(...a) { throw new Error(a.join(' ')); }, warn(...a) { warnings.push(a.join(' ')); return logger; }, info() { return logger; }, debug() { return logger; } };
  const { spec: vega } = vl.compile(spec, { logger });
  if (warnings.length) throw new Error(`Vega-Lite warnings for ${spec?.usermeta?.generator ?? 'chart'}: ${warnings.join('; ')}`);
  return vega;
}

// Chart data at build time: files the site serves under /data/, read from public/. Nothing else.
export function siteLoader() {
  const loader = vegaLoader();
  loader.load = async (uri) => {
    if (typeof uri !== 'string' || !/^\/data\/[\w./-]+$/.test(uri) || uri.includes('..')) throw new Error(`Charts read only /data/ files saved with the site, not ${uri}`);
    return readFileSync(new URL(`.${uri}`, PUBLIC), 'utf8');
  };
  return loader;
}

// Node has no canvas to measure text, and Vega's fallback (0.8 em a character) makes labels look
// wider than they are, which would move the layout. These widths, in 1/1000 em, are Helvetica's,
// close to the site's sans; text at weight 600 and over is taken as 6% wider.
const EM = { ' ': 278, ',': 278, '.': 278, '·': 278, ':': 278, ';': 278, '-': 333, '–': 556, '/': 278, '(': 333, ')': 333, '$': 556, '%': 889, "'": 191, '’': 222 };
for (const c of '0123456789') EM[c] = 556;
Object.assign(EM, { A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611 });
Object.assign(EM, { a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500 });

export function textWidth(item, text) {
  const size = item.fontSize != null ? +item.fontSize || 0 : 11;
  const s = text == null ? '' : String(text).trim();
  let em = 0;
  for (const c of s) em += EM[c] ?? 600;
  const bold = +item.fontWeight >= 600 || item.fontWeight === 'bold';
  return (em / 1000) * size * (bold ? 1.06 : 1);
}

// Numbers in path data and transforms to one decimal, which is finer than a pixel at 2x.
function roundNumbers(value) {
  return value.replace(/-?\d+\.\d{2,}/g, (n) => String(Math.round(Number(n) * 10) / 10));
}

// A long polyline (M x,y L x,y …) is rewritten with relative steps. The steps are taken between
// the rounded points, so every point lands exactly where the absolute path put it, in about two
// thirds of the characters.
const POLYLINE = /^M-?[\d.]+,-?[\d.]+(?:L-?[\d.]+,-?[\d.]+)+$/;
const tenths = (n) => Math.round(Number(n) * 10);
const num = (t) => {
  const s = String(Math.abs(t) / 10).replace(/^0\./, '.');
  return t < 0 ? `-${s}` : s;
};
export function relativePolyline(d) {
  if (d.length < 400 || !POLYLINE.test(d)) return d;
  const pts = d.slice(1).split('L').map((p) => p.split(',').map(tenths));
  let out = `M${num(pts[0][0])},${num(pts[0][1])}l`;
  for (let i = 1; i < pts.length; i += 1) {
    const dx = num(pts[i][0] - pts[i - 1][0]);
    const dy = num(pts[i][1] - pts[i - 1][1]);
    out += `${i > 1 && !dx.startsWith('-') ? ' ' : ''}${dx}${dy.startsWith('-') ? '' : ','}${dy}`;
  }
  return out;
}

export function tidySvg(svg, label) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return svg
    .replace(/ (d|transform|points)="([^"]*)"/g, (_, k, v) => ` ${k}="${k === 'd' ? relativePolyline(roundNumbers(v)) : roundNumbers(v)}"`)
    .replace(/^<svg ([^>]*)class="marks"/, `<svg $1class="altair-svg" role="img" aria-label="${esc(label)}" focusable="false"`);
}

// Draw a compiled chart to SVG. `width` is the width of the plot (each panel's, when faceted); a
// chart that keeps its own size takes none. `signals` sets parameters such as a period. Returns the SVG and its full size, so callers can work out the room the axes
// and padding take.
export async function renderStatic(vega, { width, signals = {}, label }) {
  const previous = textMetrics.width;
  textMetrics.width = textWidth;
  try {
    const view = new View(parse(vega, null, { ast: true }), { renderer: 'none', expr: expressionInterpreter, loader: siteLoader() });
    if (width !== undefined) view.signal(widthSignal(vega), width);
    for (const [k, v] of Object.entries(signals)) view.signal(k, v);
    await view.runAsync();
    const raw = await view.toSVG();
    view.finalize();
    const size = raw.match(/^<svg [^>]*width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
    if (!size) throw new Error('Rendered SVG has no size');
    return { svg: tidySvg(raw, label ?? vega.description ?? ''), width: Number(size[1]), height: Number(size[2]) };
  } finally {
    textMetrics.width = previous;
  }
}

// Draw a chart at a given full width: the plot gets what is left after the axes and padding. A
// label that overhangs the plot can make that room depend on the width, so the fit is checked at
// the width itself and corrected once.
export async function renderAtWidth(vega, { fullWidth, signals, label }) {
  const probe = await renderStatic(vega, { width: 300, signals, label });
  let width = Math.floor(fullWidth - (probe.width - 300));
  let out = await renderStatic(vega, { width, signals, label });
  if (out.width !== fullWidth) {
    width += fullWidth - out.width;
    out = await renderStatic(vega, { width, signals, label });
  }
  if (out.width > fullWidth) throw new Error(`Chart is ${out.width} px wide at a ${fullWidth} px column`);
  return { ...out, panelWidth: width, chrome: fullWidth - width };
}
