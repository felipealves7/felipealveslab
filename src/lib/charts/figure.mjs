// The page markup for an Altair chart: two drawings made at build time, one for a wide container
// and one for a narrow one (CSS container queries pick between them), the controls that set its
// parameters, a table view and the source line. A live chart also carries its compiled spec, with
// its rows, for src/lib/charts/live.mjs to draw at the container's exact width and wire up.
import { compileChart, withRows, renderAtWidth, renderStatic } from './render.mjs';

// Inside the chart frame: a wide Lab column, and a 375 px phone (the column less the frame border).
export const WIDE = 718;
export const NARROW = 349;
// A compact chart on a card: a wide card, and the narrowest (a 375 px phone).
export const CARD_WIDE = 520;
export const CARD_NARROW = 305;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// JSON inside <script type="application/json">: no "<" can close the element early.
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

export function tableHtml(head, rows) {
  const th = head.map((h) => `<th scope="col">${esc(h)}</th>`).join('');
  const tr = rows.map((cells) => `<tr><th scope="row">${esc(cells[0])}</th>${cells.slice(1).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

function controlsHtml(controls) {
  return controls.map((c) => `<div class="altair-controls" role="group" aria-label="${esc(c.label)}">${c.options.map((o, i) => (
    `<button type="button" data-param="${esc(c.param)}" data-value="${esc(o.value)}" aria-pressed="${i === 0}" disabled>${esc(o.label)}</button>`
  )).join('')}</div>`).join('');
}

// vlSpec: the Vega-Lite spec written by charts/build.py; rows: the data sources it names in
// usermeta.rows, built from the page's saved results. compact: a card chart, drawn at card sizes
// and not run live. extra: markup placed under the chart, already escaped. tag: "div" for a chart
// that sits inside another figure. Returns the figure's HTML.
export async function altairFigure({
  id, vlSpec, rows = {}, title, subtitle, controls = [], hint, table, source, label,
  compact = false, live = !compact, className = '', note, extra = '', tag = 'figure',
}) {
  const vega = withRows(compileChart(vlSpec), rows);
  // A chart that keeps its own size (usermeta.live.width false) is drawn once.
  const fixed = vega.usermeta?.live?.width === false;
  const [wideAt, narrowAt] = compact ? [CARD_WIDE, CARD_NARROW] : [WIDE, NARROW];
  // One at a time: the build-time text measure is set for the length of each drawing.
  const wide = fixed ? await renderStatic(vega, { label }) : await renderAtWidth(vega, { fullWidth: wideAt, label });
  const narrow = fixed ? null : await renderAtWidth(vega, { fullWidth: narrowAt, label });
  if (fixed && wide.width > narrowAt) throw new Error(`${id}: ${wide.width} px wide, more than a ${narrowAt} px phone column`);
  const classes = ['altair-figure', compact && 'altair-figure--compact', fixed && 'altair-figure--fixed', className].filter(Boolean).join(' ');
  const caption = title ? `<strong>${esc(title)}</strong>${subtitle ? `<span>${esc(subtitle)}</span>` : ''}` : '';
  return `<${tag} class="${classes}" id="${esc(id)}"${live ? ` data-altair data-chrome="${fixed ? 0 : wide.chrome}"` : ''}>`
    + (caption ? (tag === 'figure' ? `<figcaption class="altair-caption">${caption}</figcaption>` : `<p class="altair-caption">${caption}</p>`) : '')
    + (live ? controlsHtml(controls) : '')
    + `<div class="altair-frame">`
    + (fixed ? `<div class="altair-static">${wide.svg}</div>`
      : `<div class="altair-static altair-static--wide">${wide.svg}</div><div class="altair-static altair-static--narrow">${narrow.svg}</div>`)
    + (live ? '<div class="altair-live" hidden></div><div class="altair-tip" role="status" aria-live="polite" hidden></div>' : '')
    + `</div>`
    + (note ? `<p class="altair-note">${esc(note)}</p>` : '')
    + extra
    + (live && hint ? `<p class="altair-hint" hidden>${esc(hint)}</p>` : '')
    + (live ? `<script type="application/json" class="altair-spec">${scriptJson(vega)}</script>` : '')
    + (table ? `<details class="altair-table"><summary>Show the numbers</summary>${table}</details>` : '')
    + (source ? `<p class="altair-source">${source}</p>` : '')
    + `</${tag}>`;
}
