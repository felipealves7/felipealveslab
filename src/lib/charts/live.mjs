// Browser side of the site's Altair charts. Each live figure made by src/lib/charts/figure.mjs
// carries its compiled chart. When the figure comes within 400 px of the screen, this draws the
// chart with Vega at the width of its frame, in place of the drawing made at build time, and wires
// the buttons, the pointer, touch and the arrow keys. Vega runs with its expression interpreter, so
// the page needs no 'unsafe-eval'. If anything fails, the build-time drawing stays.
//
// What a chart leaves to the page is named in its spec, under usermeta.live (charts/README.md):
//   params: parameters set by the buttons above the chart
//   width:  false for a chart that keeps its own size; otherwise it is laid out to the frame
//   pick:   the item the reader points at, or moves to with the arrow keys
//     mark     the mark whose items can be picked (the first panel's, in a faceted chart)
//     by       "x" (nearest across), "y" (nearest down) or "xy" (nearest point)
//     signal   the parameter set to the picked item's datum[key], or null when nothing is picked
//     key      the field that names an item
//     readout  the mark whose first item's tooltip is shown (default: the picked item's own)

let modules;
const loadVega = () => (modules ??= Promise.all([import('vega'), import('vega-interpreter')]));

export function mountCharts(root = document) {
  const figures = [...root.querySelectorAll('[data-altair]')];
  if (!figures.length) return;
  const start = (figure) => mount(figure).catch(() => { figure.dataset.altair = 'static'; });
  if (!('IntersectionObserver' in window)) { figures.forEach(start); return; }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) { io.unobserve(entry.target); start(entry.target); }
  }, { rootMargin: '400px 0px' });
  figures.forEach((figure) => io.observe(figure));
}

// Every mark with this name, with the offset of the group it is drawn in.
function marksNamed(scene, name) {
  const found = [];
  (function walk(mark, ox, oy) {
    if (mark.name === name) found.push({ mark, ox, oy });
    if (mark.marktype !== 'group') return;
    for (const group of mark.items) {
      for (const child of group.items || []) walk(child, ox + (group.x || 0), oy + (group.y || 0));
    }
  })(scene, 0, 0);
  return found;
}

// A readout is a tooltip value: an object of label → value (the first value is the heading), or an
// array of a heading and [value, label] pairs, when the order or the labels come from the data.
function writeTip(tip, values) {
  tip.textContent = '';
  const entries = Array.isArray(values) ? [['', values[0]], ...values.slice(1).map(([v, k]) => [k, v])]
    : typeof values === 'object' ? Object.entries(values) : [['', values]];
  const head = document.createElement('strong');
  head.textContent = String(entries[0][1]);
  tip.append(head);
  for (const [name, value] of entries.slice(1)) {
    const row = document.createElement('span');
    const v = document.createElement('b');
    v.textContent = String(value);
    row.append(v, document.createTextNode(` ${name}`));
    tip.append(row);
  }
}

async function mount(figure) {
  const [{ View, parse }, { expressionInterpreter }] = await loadVega();
  const spec = JSON.parse(figure.querySelector('script.altair-spec').textContent);
  const live = spec.usermeta?.live ?? {};
  const pick = live.pick;
  const frame = figure.querySelector('.altair-frame');
  const holder = figure.querySelector('.altair-live');
  const tip = figure.querySelector('.altair-tip');
  const hint = figure.querySelector('.altair-hint');
  const buttons = [...figure.querySelectorAll('button[data-param]')];
  const chrome = Number(figure.dataset.chrome) || 0;
  const widthSignal = (spec.signals ?? []).some((s) => s.name === 'child_width') ? 'child_width' : 'width';
  const plotWidth = () => Math.max(160, Math.floor(frame.clientWidth - chrome));

  const view = new View(parse(spec, null, { ast: true }), {
    renderer: 'svg', container: holder, expr: expressionInterpreter, hover: false, tooltip: () => {},
  });
  const fitted = live.width !== false;
  let width = plotWidth();
  // Lay the chart out at the frame's width; a label overhanging the plot is corrected for once.
  async function layout() {
    if (!fitted) { await view.runAsync(); return; }
    view.signal(widthSignal, width).resize();
    await view.runAsync();
    const drawn = Number(holder.querySelector('svg')?.getAttribute('width'));
    const off = Math.round(frame.clientWidth - drawn);
    if (drawn && off !== 0 && Math.abs(off) < 60) {
      width += off;
      view.signal(widthSignal, width).resize();
      await view.runAsync();
    }
  }
  await layout();

  holder.hidden = false;
  for (const node of figure.querySelectorAll('.altair-static')) node.hidden = true;
  if (hint) hint.hidden = false;
  figure.dataset.altair = 'live';
  const svg = () => holder.querySelector('svg');
  const caption = figure.querySelector('figcaption strong')?.textContent ?? 'Chart';

  // The items the reader can pick, in the chart's own pixels, in reading order.
  let items = [];
  let index = -1;
  let wanted = -1;
  let pinned = false;
  const hasSignal = (name) => (spec.signals ?? []).some((s) => s.name === name);
  function measure() {
    items = [];
    if (!pick) return;
    const pad = view.padding();
    const [ox, oy] = view.origin();
    // The mark can sit in several groups: one per panel of a faceted chart, one per series of a
    // line chart, one per bar for rounded bars. Each item is taken once per key, first panel first.
    const seen = new Set();
    for (const found of marksNamed(view.scenegraph().root, pick.mark)) {
      // A line or area is one path through its items, so its items carry no bounds of their own.
      const path = ['line', 'area', 'trail'].includes(found.mark.marktype);
      for (const item of found.mark.items) {
        const key = item.datum?.[pick.key];
        if (seen.has(key)) continue;
        seen.add(key);
        const b = path ? null : item.bounds;
        const left = pad.left + ox + found.ox;
        const top = pad.top + oy + found.oy;
        items.push({
          item, key,
          x: left + (b ? (b.x1 + b.x2) / 2 : item.x),
          y: top + (b ? (b.y1 + b.y2) / 2 : item.y),
          top: top + (b ? b.y1 : item.y),
          bottom: top + (b ? b.y2 : item.y),
          right: left + (b ? b.x2 : item.x),
        });
      }
    }
    const by = pick.by ?? 'x';
    items.sort((a, b) => (by === 'y' ? a.y - b.y : by === 'x' ? a.x - b.x : (a.y - b.y) || (a.x - b.x)));
  }
  measure();

  function nearest(x, y) {
    const by = pick.by ?? 'x';
    let best = 0;
    let bestD = Infinity;
    items.forEach((it, i) => {
      const d = by === 'x' ? Math.abs(it.x - x) : by === 'y' ? Math.abs(it.y - y) : Math.hypot(it.x - x, it.y - y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function showTip(i) {
    const it = items[i];
    let values = it?.item.tooltip;
    if (pick.readout) {
      const [read] = marksNamed(view.scenegraph().root, pick.readout).filter((m) => m.mark.items.length);
      values = read?.mark.items[0].tooltip;
    }
    if (values == null || values === '') { tip.hidden = true; return; }
    writeTip(tip, values);
    tip.hidden = false;
    // Beside the item, on whichever side has room, and always inside the frame.
    const box = svg().getBoundingClientRect();
    const scale = box.width / Number(svg().getAttribute('width'));
    const across = (pick.by ?? 'x') === 'x';
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    // Across a line chart: beside the hairline. Bars and squares: under the item, or over it when
    // there is no room below, so the item itself stays in view.
    let left;
    let top;
    if (across) {
      left = it.x * scale + 12;
      if (left + w > fw - 4) left = it.x * scale - 12 - w;
      top = 34;
    } else {
      left = it.x * scale - w / 2;
      top = it.bottom * scale + 8;
      if (top + h > fh - 4) top = it.top * scale - 8 - h;
    }
    left = Math.max(4, Math.min(left, fw - w - 4));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(Math.max(4, Math.min(top, fh - h - 4)))}px`;
  }

  let frameRequest = 0;
  function point(i) {
    if (!items.length) return;
    wanted = Math.max(0, Math.min(items.length - 1, i));
    if (frameRequest) return;
    frameRequest = requestAnimationFrame(async () => {
      frameRequest = 0;
      if (wanted === index) return;
      index = wanted;
      if (pick.signal && hasSignal(pick.signal)) {
        view.signal(pick.signal, items[index].key);
        await view.runAsync();
      }
      showTip(index);
    });
  }
  async function clear() {
    index = -1;
    wanted = -1;
    pinned = false;
    tip.hidden = true;
    if (pick?.signal && hasSignal(pick.signal)) {
      view.signal(pick.signal, null);
      await view.runAsync();
    }
  }

  if (pick) {
    const fromEvent = (event) => {
      const box = svg().getBoundingClientRect();
      const scale = Number(svg().getAttribute('width')) / box.width;
      point(nearest((event.clientX - box.left) * scale, (event.clientY - box.top) * scale));
    };
    holder.addEventListener('pointermove', fromEvent);
    holder.addEventListener('pointerdown', (event) => { pinned = event.pointerType !== 'mouse'; fromEvent(event); });
    holder.addEventListener('pointerleave', () => { if (!pinned && document.activeElement !== holder) clear(); });
    document.addEventListener('pointerdown', (event) => { if (pinned && !holder.contains(event.target)) clear(); });

    const across = (pick.by ?? 'x') !== 'y';
    holder.tabIndex = 0;
    holder.setAttribute('role', 'group');
    holder.setAttribute('aria-label', `${caption}. Use the arrow keys to read each value, Home and End for the first and last.`);
    // Keyboard focus starts on the last item; a click or tap that focuses the chart keeps its own.
    holder.addEventListener('focus', () => {
      if (holder.matches(':focus-visible')) point(wanted < 0 ? (across ? items.length - 1 : 0) : wanted);
    });
    holder.addEventListener('blur', () => { if (!pinned) clear(); });
    holder.addEventListener('keydown', (event) => {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[event.key];
      if (step) point((wanted < 0 ? (across ? items.length - 1 : 0) : wanted) + step);
      else if (event.key === 'Home') point(0);
      else if (event.key === 'End') point(items.length - 1);
      else if (event.key === 'Escape') clear();
      else return;
      event.preventDefault();
    });
  }

  for (const button of buttons) {
    button.disabled = false;
    button.addEventListener('click', async () => {
      for (const b of buttons) if (b.dataset.param === button.dataset.param) b.setAttribute('aria-pressed', String(b === button));
      view.signal(button.dataset.param, button.dataset.value).resize();
      await clear();
      measure();
    });
  }

  if (fitted && 'ResizeObserver' in window) {
    let pending = 0;
    new ResizeObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(async () => {
        const next = plotWidth();
        if (Math.abs(next - width) < 2) return;
        width = next;
        // resize() lets the view shrink as well as grow to the new layout.
        await layout();
        measure();
        if (index >= 0) showTip(index);
      }, 120);
    }).observe(frame);
  }
}
