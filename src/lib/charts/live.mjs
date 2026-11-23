// Browser side of the site's Altair charts. Each figure made by src/lib/charts/figure.mjs carries
// its compiled chart. When the figure comes within 400 px of the screen, this draws the chart with
// Vega at the width of the column, in place of the drawing made at build time, and wires the
// controls, the pointer and the arrow keys. Vega runs with its expression interpreter, so the page
// needs no 'unsafe-eval'. If anything fails, the build-time drawing stays.
//
// What a chart leaves to the page is named in its spec, under usermeta.live (charts/README.md):
//   day:     the parameter holding the day the reader points at, or null
//   key:     the data field that names a day
//   snap:    the mark whose points the pointer snaps to (the first panel's line)
//   readout: the mark whose tooltip lists the values for that day
//   params:  parameters set by the buttons above the chart

let modules;
const loadVega = () => (modules ??= Promise.all([import('vega'), import('vega-interpreter')]));

export function mountCharts(root = document) {
  const figures = [...root.querySelectorAll('figure[data-altair]')];
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

async function mount(figure) {
  const [{ View, parse }, { expressionInterpreter }] = await loadVega();
  const spec = JSON.parse(figure.querySelector('script.altair-spec').textContent);
  const live = spec.usermeta?.live ?? {};
  const frame = figure.querySelector('.altair-frame');
  const holder = figure.querySelector('.altair-live');
  const tip = figure.querySelector('.altair-tip');
  const hint = figure.querySelector('.altair-hint');
  const buttons = [...figure.querySelectorAll('button[data-param]')];
  const chrome = Number(figure.dataset.chrome) || 0;
  const panelWidth = () => Math.max(160, Math.floor(frame.clientWidth - chrome));

  const view = new View(parse(spec, null, { ast: true }), {
    renderer: 'svg', container: holder, expr: expressionInterpreter, hover: false, tooltip: () => {},
  });
  let width = panelWidth();
  view.signal('child_width', width);
  await view.runAsync();

  holder.hidden = false;
  for (const node of figure.querySelectorAll('.altair-static')) node.hidden = true;
  if (hint) hint.hidden = false;
  figure.dataset.altair = 'live';
  const svg = () => holder.querySelector('svg');
  const caption = figure.querySelector('figcaption strong')?.textContent ?? 'Chart';

  // Where the days sit, in the chart's own pixels, for the pointer and the arrow keys.
  let days = [];
  let xs = [];
  let index = -1;
  let pinned = false;
  function measure() {
    const [snap] = marksNamed(view.scenegraph().root, live.snap);
    const pad = view.padding();
    const [ox] = view.origin();
    const items = snap ? [...snap.mark.items].sort((a, b) => a.x - b.x) : [];
    days = items.map((item) => item.datum[live.key]);
    xs = items.map((item) => pad.left + ox + snap.ox + item.x);
  }
  measure();

  function nearest(x) {
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid; else hi = mid; }
    return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi;
  }

  function showTip(i) {
    const [read] = marksNamed(view.scenegraph().root, live.readout).filter((m) => m.mark.items.length);
    const values = read?.mark.items[0].tooltip;
    if (!values || typeof values !== 'object') { tip.hidden = true; return; }
    tip.textContent = '';
    const entries = Object.entries(values);
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
    const box = svg().getBoundingClientRect();
    const scale = box.width / Number(svg().getAttribute('width'));
    const left = xs[i] * scale;
    tip.hidden = false;
    tip.style.left = `${left}px`;
    tip.classList.toggle('is-left', left > box.width * 0.6);
  }

  let frameRequest = 0;
  let wanted = -1;
  function point(i) {
    wanted = Math.max(0, Math.min(days.length - 1, i));
    if (frameRequest) return;
    frameRequest = requestAnimationFrame(async () => {
      frameRequest = 0;
      if (wanted === index) return;
      index = wanted;
      view.signal(live.day, days[index]);
      await view.runAsync();
      showTip(index);
    });
  }
  async function clear() {
    index = -1;
    wanted = -1;
    pinned = false;
    tip.hidden = true;
    view.signal(live.day, null);
    await view.runAsync();
  }

  function fromEvent(event) {
    const box = svg().getBoundingClientRect();
    const scale = Number(svg().getAttribute('width')) / box.width;
    point(nearest((event.clientX - box.left) * scale));
  }
  holder.addEventListener('pointermove', fromEvent);
  holder.addEventListener('pointerdown', (event) => { pinned = event.pointerType !== 'mouse'; fromEvent(event); });
  holder.addEventListener('pointerleave', () => { if (!pinned && document.activeElement !== holder) clear(); });
  document.addEventListener('pointerdown', (event) => { if (pinned && !holder.contains(event.target)) clear(); });

  holder.tabIndex = 0;
  holder.setAttribute('role', 'group');
  holder.setAttribute('aria-label', `${caption}. Use the left and right arrow keys to read each day, Home and End for the first and last.`);
  // Keyboard focus starts on the last day; a click or tap that focuses the chart keeps its own day.
  holder.addEventListener('focus', () => {
    if (holder.matches(':focus-visible')) point(wanted < 0 ? days.length - 1 : wanted);
  });
  holder.addEventListener('blur', () => { if (!pinned) clear(); });
  holder.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (step) point((wanted < 0 ? days.length - 1 : wanted) + step);
    else if (event.key === 'Home') point(0);
    else if (event.key === 'End') point(days.length - 1);
    else if (event.key === 'Escape') clear();
    else return;
    event.preventDefault();
  });

  for (const button of buttons) {
    button.disabled = false;
    button.addEventListener('click', async () => {
      for (const b of buttons) if (b.dataset.param === button.dataset.param) b.setAttribute('aria-pressed', String(b === button));
      view.signal(button.dataset.param, button.dataset.value).resize();
      await clear();
      measure();
    });
  }

  if ('ResizeObserver' in window) {
    let pending = 0;
    new ResizeObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(async () => {
        const next = panelWidth();
        if (Math.abs(next - width) < 2) return;
        width = next;
        // resize() lets the view shrink as well as grow to the new layout.
        view.signal('child_width', width).resize();
        await view.runAsync();
        measure();
        if (index >= 0) showTip(index);
      }, 120);
    }).observe(frame);
  }
}
