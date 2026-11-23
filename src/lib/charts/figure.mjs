// The page markup for an Altair chart: two drawings made at build time, one laid out for a wide
// column and one for a 375 px phone, the compiled chart for the browser, the controls that set its
// parameters, and a table view. With no JavaScript the drawing for the screen size shows; with it,
// src/lib/charts/live.mjs draws the same chart at the column's width and wires the controls.
import { compileChart, renderAtWidth } from './render.mjs';

// Inside the chart frame: the widest Lab column, and a 375 px phone (the column less the frame border).
export const WIDE = 718;
export const NARROW = 349;

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

// vlSpec: the Vega-Lite spec written by charts/build.py. Returns the figure's HTML.
export async function altairFigure({ id, vlSpec, title, subtitle, controls = [], hint, table, source, label }) {
  const vega = compileChart(vlSpec);
  // One at a time: the build-time text measure is set for the length of each drawing.
  const wide = await renderAtWidth(vega, { fullWidth: WIDE, label });
  const narrow = await renderAtWidth(vega, { fullWidth: NARROW, label });
  if (wide.chrome !== narrow.chrome) throw new Error(`${id}: the axes and padding change width with the panel`);
  return `<figure class="lab-svg-figure altair-figure" id="${esc(id)}" data-altair data-chrome="${wide.chrome}">`
    + `<figcaption class="lab-svg-caption"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></figcaption>`
    + controlsHtml(controls)
    + `<div class="altair-frame">`
    + `<div class="altair-static altair-static--wide">${wide.svg}</div>`
    + `<div class="altair-static altair-static--narrow">${narrow.svg}</div>`
    + `<div class="altair-live" hidden></div>`
    + `<div class="altair-tip" role="status" aria-live="polite" hidden></div>`
    + `</div>`
    + (hint ? `<p class="altair-hint" hidden>${esc(hint)}</p>` : '')
    + `<script type="application/json" class="altair-spec">${scriptJson(vega)}</script>`
    + `<details class="lab-svg-table"><summary>Show the numbers</summary>${table}</details>`
    + `<p class="lab-svg-source">${source}</p>`
    + `</figure>`;
}
