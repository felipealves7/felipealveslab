// The airport Lab page's live piece. It replays a saved pipeline run step by step, next to the code
// that runs at each step, and lets a visitor run the same code on today's files in the browser, then
// break that copy on purpose and watch the gate turn red. Mounted into #airport-replay by
// src/components/AirportReplay.astro.
//
// Every figure comes from a run record through summary.mjs. Data and code only ever become text
// nodes, never HTML. Runs are read from the weekly branch first, with the copy saved in the site as
// the fallback, so the page works with no live service.

import { fetchTables } from '../../../pipelines/airport-contract/load.mjs';
import { makeRun } from '../../../pipelines/airport-contract/record.mjs';
import { FAULTS, applyFaults } from '../../../pipelines/airport-contract/faults.mjs';
import { readsById, REQUIRED_COLUMNS, MAX_AGE_DAYS } from '../../../pipelines/airport-contract/contract.mjs';
import * as S from './summary.mjs';
import { tokens } from './highlight.mjs';

export const RUNS_URL = 'https://raw.githubusercontent.com/felipealves7/felipealveslab/airport-runs/results.json';
export const BUNDLED_URL = '/data/airport-contract/results.json';
const REPO_BLOB = 'https://github.com/felipealves7/felipealveslab/blob/main/pipelines/airport-contract/';
const RUNS_BRANCH = 'https://github.com/felipealves7/felipealveslab/tree/airport-runs';
const READS = readsById();

// ---------- small DOM helpers: text only, never HTML ----------

function h(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    n.append(c instanceof Node ? c : String(c));
  }
  return n;
}

const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...children) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const plural = (n, one, many = `${one}s`) => `${S.fmtInt(n)} ${n === 1 ? one : many}`;

// ---------- loading the runs ----------

function valid(d) {
  return Boolean(d && Array.isArray(d.runs) && d.runs.length && d.runs.every((r) =>
    r && typeof r.runDate === 'string' && Array.isArray(r.checks) && r.rows && r.freshness && typeof r.status === 'string'));
}

async function getJson(url, ms) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  try {
    const res = await fetch(url, { signal: ctl?.signal, cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    return valid(data) ? data : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const newest = (d) => Math.max(...d.runs.map((r) => Date.parse(r.runDate)));

// Both sources are read at once; the one with the newer last run wins.
export async function loadRuns({ runsUrl = RUNS_URL, bundledUrl = BUNDLED_URL } = {}) {
  const [weekly, bundled] = await Promise.all([getJson(runsUrl, 5000), getJson(bundledUrl, 10000)]);
  if (weekly && (!bundled || newest(weekly) >= newest(bundled))) return { data: weekly, source: 'weekly' };
  if (bundled) return { data: bundled, source: 'bundled' };
  return null;
}

// ---------- code cells ----------

function codeCell(tag, file, region, caption) {
  if (!region) return null;
  const pre = h('pre', { class: 'ar-code', tabindex: '0' });
  const code = h('code');
  let line = h('span', { class: 'ar-line', 'data-n': region.from });
  let n = region.from;
  for (const t of tokens(region.code)) {
    const parts = t.s.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) {
        code.append(line, '\n');
        n += 1;
        line = h('span', { class: 'ar-line', 'data-n': n });
      }
      if (part) line.append(t.t === 'plain' ? part : h('span', { class: `tok-${t.t}`, text: part }));
    });
  }
  code.append(line);
  pre.append(code);
  const lines = region.from === region.to ? `line ${region.from}` : `lines ${region.from}–${region.to}`;
  return h('figure', { class: 'ar-cell ar-cell-in' },
    h('figcaption', { class: 'ar-cell-head' },
      h('span', { class: 'ar-cell-tag', text: tag }),
      caption ? h('span', { class: 'ar-cell-caption', text: caption }) : null,
      h('a', { class: 'ar-cell-src', href: `${REPO_BLOB}${file}#L${region.from}-L${region.to}`, target: '_blank', rel: 'noopener', text: `${file} · ${lines}` })),
    pre);
}

function outCell(tag, ...children) {
  return h('div', { class: 'ar-cell ar-cell-out' }, h('div', { class: 'ar-cell-head' }, h('span', { class: 'ar-cell-tag', text: tag })), h('div', { class: 'ar-out-body' }, children));
}

// ---------- pieces of output ----------

const STATE_WORD = { pass: 'Pass', warn: 'Pass, with bad rows counted', fail: 'Fail', idle: 'Not saved' };
const chip = (state, text) => h('span', { class: `ar-chip is-${state}`, text: text ?? STATE_WORD[state] });

function meter({ value, limit, max, valueLabel, limitLabel, state }) {
  const pct = (x) => `${Math.max(0, Math.min(100, (x / max) * 100))}%`;
  return h('div', { class: `ar-meter is-${state}` },
    h('div', { class: 'ar-meter-track' },
      h('div', { class: 'ar-meter-fill', style: `width:${pct(value)}` }),
      h('div', { class: 'ar-meter-limit', style: `left:${pct(limit)}`, title: limitLabel })),
    h('div', { class: 'ar-meter-labels' }, h('span', { text: valueLabel }), h('span', { text: limitLabel })));
}

const FILE_ROLE = {
  airports: 'Every airport, heliport and seaplane base on OurAirports, one per row.',
  runways: 'Runways, each linked to its airport by airport_ref.',
  countries: 'Two-letter country codes and names.',
};

function fileTiles(run) {
  const files = Object.fromEntries((run.files ?? []).map((f) => [f.table, f]));
  return h('div', { class: 'ar-files' }, S.TABLE_ORDER.map((t) => h('div', { class: 'ar-file' },
    h('strong', { text: `${t}.csv` }),
    h('p', { text: FILE_ROLE[t] }),
    h('div', { class: 'ar-file-facts' },
      h('span', { text: plural(run.rows[t] ?? 0, 'row') }),
      files[t] ? h('span', { text: S.fmtBytes(files[t].bytes) }) : null))));
}

function downloadTable(run) {
  if (!run.files?.length) {
    return h('p', { class: 'ar-note', text: 'Runs saved before this page was rebuilt kept only the oldest Last-Modified date, not each file’s size, status or timing. Later runs keep them.' });
  }
  return h('table', { class: 'ar-table' },
    h('thead', {}, h('tr', {}, ['File', 'HTTP', 'Last changed', 'Size', 'Download'].map((x) => h('th', { text: x })))),
    h('tbody', {}, run.files.map((f) => h('tr', {},
      h('td', { text: `${f.table}.csv` }),
      h('td', { text: String(f.httpStatus) }),
      h('td', { text: f.lastModified ? `${S.fmtDate(f.lastModified)}, ${S.fmtTime(f.lastModified)}` : 'not sent' }),
      h('td', { text: S.fmtBytes(f.bytes) }),
      h('td', { text: S.fmtMs(f.fetchMs) })))));
}

function freshnessMeter(run) {
  const age = run.freshness.ageDays;
  return h('div', { class: 'ar-fresh' },
    h('p', { class: 'ar-out-lead' },
      `Oldest file changed ${S.fmtDate(run.freshness.upstreamLastModified)}, ${S.fmtTime(run.freshness.upstreamLastModified)}: `,
      h('strong', { text: `${S.fmtDays(age)} before the run.` })),
    meter({
      value: Math.max(age, 0), limit: MAX_AGE_DAYS, max: Math.max(MAX_AGE_DAYS * 1.5, age * 1.1),
      valueLabel: `${S.fmtDays(age)} old`, limitLabel: `${MAX_AGE_DAYS} days allowed`, state: run.freshness.ok ? 'pass' : 'fail',
    }));
}

function rowBars(run) {
  const max = Math.max(...S.TABLE_ORDER.map((t) => run.rows[t] ?? 0), 1);
  const files = Object.fromEntries((run.files ?? []).map((f) => [f.table, f]));
  return h('div', { class: 'ar-bars', role: 'img', 'aria-label': S.TABLE_ORDER.map((t) => `${t}: ${S.fmtInt(run.rows[t] ?? 0)} rows`).join(', ') },
    S.TABLE_ORDER.map((t) => h('div', { class: 'ar-bar-row' },
      h('span', { class: 'ar-bar-name', text: t }),
      h('span', { class: 'ar-bar-track' }, h('span', { class: 'ar-bar-fill', style: `width:${Math.max(0.6, ((run.rows[t] ?? 0) / max) * 100)}%` })),
      h('span', { class: 'ar-bar-value', text: S.fmtInt(run.rows[t] ?? 0) }),
      h('span', { class: 'ar-bar-sub', text: `${run.columns?.[t] ?? '?'} columns, ${REQUIRED_COLUMNS[t].length} read${files[t] ? ` · parsed in ${S.fmtMs(files[t].parseMs)}` : ''}` }))));
}

function ruleTile(c, follows) {
  const state = c.passed ? (c.failed > 0 ? 'warn' : 'pass') : 'fail';
  let detail;
  if (follows) detail = h('p', { class: 'ar-rule-detail', text: `Fails because ${follows} is missing.` });
  else if (c.level === 'table') detail = h('p', { class: 'ar-rule-detail', text: c.passed ? 'Holds for the whole file.' : c.samples.join('; ') });
  else {
    const share = c.checked ? c.failed / c.checked : 0;
    detail = h('div', {},
      h('p', { class: 'ar-rule-detail', text: c.failed ? `${S.fmtInt(c.failed)} of ${S.fmtInt(c.checked)} rows bad (${S.fmtShare(c.failed, c.checked)})${c.samples?.length ? `, e.g. ${c.samples[0]}` : ''}` : `0 of ${S.fmtInt(c.checked)} rows bad` }),
      c.tolerance > 0 ? meter({
        value: share, limit: c.tolerance, max: Math.max(c.tolerance * 2, share * 1.1),
        valueLabel: S.fmtShare(c.failed, c.checked), limitLabel: `${S.fmtTolerance(c.tolerance)} allowed`, state,
      }) : h('p', { class: 'ar-rule-tol', text: 'No bad rows allowed.' }));
  }
  return h('li', { class: `ar-rule is-${state}` },
    h('span', { class: 'ar-rule-mark', 'aria-hidden': 'true', text: state === 'pass' ? '✓' : state === 'warn' ? '!' : '✕' }),
    h('div', {}, h('p', { class: 'ar-rule-says', text: c.says }), detail));
}

function ruleGrid(run) {
  const n = S.counts(run);
  const follows = S.followers(run, READS);
  return h('div', { class: 'ar-rules' },
    h('p', { class: 'ar-out-lead' },
      h('strong', { text: `${n.pass} passed` }), ' · ',
      h('span', { class: n.tolerated ? 'is-warn-text' : '', text: `${n.tolerated} within tolerance` }), ' · ',
      h('span', { class: n.fail ? 'is-fail-text' : '', text: `${n.fail} failed` })),
    S.groupByTable(run).map((g) => h('section', { class: 'ar-rule-group' },
      h('h4', {}, `${g.table}.csv `, h('span', { text: plural(g.rows, 'row') })),
      h('ul', { class: 'ar-rule-list' }, g.checks.map((c) => ruleTile(c, follows[c.id]))))));
}

function fork(run) {
  const pass = run.status === 'pass';
  const path = (d, taken) => svg('path', { d, class: taken ? 'ar-fork-path is-taken' : 'ar-fork-path', 'vector-effect': 'non-scaling-stroke' });
  return h('div', { class: `ar-fork ${pass ? 'is-pass' : 'is-fail'}` },
    h('div', { class: 'ar-fork-q' },
      h('span', { class: 'ar-fork-kicker', text: 'The gate' }),
      h('strong', { text: `Did all ${run.checks.length} rules pass, and are the files at most ${MAX_AGE_DAYS} days old?` })),
    svg('svg', { class: 'ar-fork-lines', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
      path('M0 50 C 45 50, 55 22, 100 22', pass),
      path('M0 50 C 45 50, 55 78, 100 78', !pass)),
    h('div', { class: 'ar-fork-branches' },
      h('div', { class: `ar-branch is-yes${pass ? ' is-taken' : ''}` },
        h('span', { class: 'ar-branch-label', text: 'Yes' }),
        h('strong', { text: 'Recorded as passed' }),
        h('p', { text: 'Exit code 0. The freshness badge counts from this run.' })),
      h('div', { class: `ar-branch is-no${pass ? '' : ' is-taken'}` },
        h('span', { class: 'ar-branch-label', text: 'No' }),
        h('strong', { text: 'Recorded as failed, with its causes' }),
        h('p', { text: 'Exit code 1, so the weekly job shows red on GitHub. The badge keeps counting from the last pass.' }))));
}

function causeList(run) {
  if (run.status === 'pass') return h('p', { class: 'ar-verdict is-pass', text: S.headline(run, READS) });
  const list = S.causes(run, READS);
  return h('div', { class: 'ar-verdict is-fail' },
    h('p', { class: 'ar-verdict-title', text: list.length === 1 ? 'One cause' : `${list.length} causes` }),
    h('ol', {}, list.map((c) => h('li', { text: S.causeSentence(c) }))));
}

// ---------- the replay ----------

export async function mountAirportReplay({ root = document.getElementById('airport-replay'), codeEl = document.getElementById('airport-code'), runsUrl, bundledUrl } = {}) {
  if (!root) return;
  let code = {};
  try { code = JSON.parse(codeEl?.textContent || '{}'); } catch { code = {}; }
  const region = (file, name) => code?.[file]?.[name];

  root.classList.add('is-loading');
  const loaded = await loadRuns({ runsUrl, bundledUrl });
  root.classList.remove('is-loading');
  if (!loaded) {
    root.replaceChildren(h('p', { class: 'ar-note', text: 'The saved runs could not be loaded. They are in data/airport-contract/results.json in the repository.' }));
    return;
  }
  const { data, source } = loaded;
  updateHero(data);

  const realRun = S.latest(data, false);
  const rehearsal = S.latest(data, true);
  const extra = { live: null, broken: null };
  let live = null; // { tables, lastModified, files } from today's download, kept for breaks
  let selected = realRun ? { key: 'latest', run: realRun } : { key: 'history', run: data.runs.at(-1) };

  const status = h('p', { class: 'ar-sr', role: 'status', 'aria-live': 'polite' });
  const picker = h('div', { class: 'ar-picker', role: 'group', 'aria-label': 'Which run to replay' });
  const rail = h('ol', { class: 'ar-rail' });
  const stepsBox = h('div', { class: 'ar-steps' });
  const replayButton = h('button', { type: 'button', class: 'ar-button ar-replay', onclick: () => replay() }, h('span', { 'aria-hidden': 'true', text: '▶' }), ' Replay');
  const sourceNote = h('p', { class: 'ar-source' });

  function choices() {
    const list = [];
    if (realRun) list.push({ key: 'latest', run: realRun, label: 'Latest run', sub: `${S.fmtDate(realRun.runDate)} · ${realRun.status === 'pass' ? 'pass' : 'fail'}` });
    if (rehearsal) list.push({ key: 'rehearsal', run: rehearsal, label: 'Rehearsed break', sub: `${S.fmtDate(rehearsal.runDate)} · fail` });
    if (extra.live) list.push({ key: 'live', run: extra.live, label: 'Today’s files', sub: `in your browser · ${extra.live.status}` });
    if (extra.broken) list.push({ key: 'broken', run: extra.broken, label: 'Your break', sub: `in your browser · ${extra.broken.status}` });
    return list;
  }

  function renderPicker() {
    picker.replaceChildren(...choices().map((c) => h('button', {
      type: 'button', class: `ar-pick${selected.key === c.key ? ' is-on' : ''}${c.run.status === 'pass' ? '' : ' is-fail'}`,
      'aria-pressed': selected.key === c.key ? 'true' : 'false',
      onclick: () => select(c.key, c.run),
    }, h('strong', { text: c.label }), h('span', { text: c.sub }))));
  }

  const NAMES = { latest: 'the latest run', rehearsal: 'the rehearsed break', live: 'the run on today’s files', broken: 'your break', history: 'a saved run' };
  function select(key, run, { animate = true } = {}) {
    selected = { key, run };
    ruleExample = null;
    renderPicker();
    renderSteps();
    status.textContent = `Showing ${NAMES[key]} from ${S.fmtDate(run.runDate)}: ${run.status}.`;
    if (animate) replay();
  }

  function stepStates(run) {
    const n = S.counts(run);
    const isSaved = selected.key !== 'live' && selected.key !== 'broken';
    return {
      source: 'pass',
      download: run.freshness.ok ? 'pass' : 'fail',
      parse: 'pass',
      contract: n.fail ? 'fail' : n.tolerated ? 'warn' : 'pass',
      gate: run.status === 'pass' ? 'pass' : 'fail',
      record: isSaved ? 'pass' : 'idle',
    };
  }

  const STEPS = [
    { id: 'source', name: 'Source' },
    { id: 'download', name: 'Download' },
    { id: 'parse', name: 'Parse' },
    { id: 'contract', name: 'Contract' },
    { id: 'gate', name: 'Gate' },
    { id: 'record', name: 'Record' },
  ];

  function step(i, title, lede, state, cells, out) {
    const s = STEPS[i];
    return h('article', { class: `ar-step is-${state}`, id: `ar-step-${s.id}`, 'data-step': s.id },
      h('header', { class: 'ar-step-head' },
        h('span', { class: 'ar-step-n', text: String(i + 1) }),
        h('div', {}, h('h3', { text: title }), h('p', { class: 'ar-step-lede', text: lede })),
        chip(state, s.id === 'record' && state === 'idle' ? 'Not saved' : undefined)),
      h('div', { class: 'ar-step-body' },
        h('div', { class: 'ar-step-in' }, cells.filter(Boolean)),
        h('div', { class: 'ar-step-out' }, out)));
  }

  let ruleExample = null;

  function contractCells(run) {
    const examples = [
      { key: 'rule-columns', label: 'Columns', ids: ['.columns'] },
      { key: 'rule-country', label: 'Country', ids: ['airports.country_known'] },
      { key: 'rule-region', label: 'Region', ids: ['airports.region_matches_country'] },
      { key: 'rule-runway', label: 'Runway length', ids: ['runways.length_positive'] },
    ];
    const matches = (e, state) => run.checks.some((c) => S.checkState(c) === state && e.ids.some((id) => c.id.endsWith(id)));
    const pick = ruleExample
      ?? examples.find((e) => matches(e, 'fail'))?.key
      ?? examples.find((e) => matches(e, 'tolerated'))?.key
      ?? 'rule-country';
    const holder = h('div', { class: 'ar-example' });
    const tabs = h('div', { class: 'ar-tabs', role: 'tablist', 'aria-label': 'Example rules' });
    const show = (key) => {
      ruleExample = key;
      tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.key === key ? 'true' : 'false'));
      holder.replaceChildren(...[codeCell('In', 'contract.mjs', region('contract.mjs', key), 'A rule as written')].filter(Boolean));
    };
    examples.forEach((e) => tabs.append(h('button', { type: 'button', role: 'tab', 'data-key': e.key, class: 'ar-tab', onclick: () => show(e.key), text: e.label })));
    show(pick);
    return [
      codeCell('In', 'contract.mjs', region('contract.mjs', 'rule-helper'), 'How a row rule is built'),
      h('div', { class: 'ar-example-box' }, tabs, holder),
      codeCell('In', 'contract.mjs', region('contract.mjs', 'tolerance'), 'Pass or fail'),
    ];
  }

  function renderSteps() {
    const run = selected.run;
    const st = stepStates(run);
    const n = S.counts(run);
    const isSaved = selected.key !== 'live' && selected.key !== 'broken';
    rail.replaceChildren(...STEPS.map((s, i) => h('li', { class: `is-${st[s.id]}` },
      h('button', { type: 'button', onclick: () => document.getElementById(`ar-step-${s.id}`)?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }) },
        h('span', { class: 'ar-rail-dot', 'aria-hidden': 'true' }), h('span', { class: 'ar-rail-n', text: String(i + 1) }), h('span', { class: 'ar-rail-name', text: s.name })))));

    stepsBox.replaceChildren(
      step(0, 'Where the data comes from',
        'OurAirports publishes its database as CSV files, updated every night and released to the Public Domain with no guarantee of accuracy. The pipeline reads three of them.',
        st.source,
        [codeCell('In', 'load.mjs', region('load.mjs', 'source'))],
        outCell('Out', fileTiles(run))),
      step(1, 'Download, and check the date',
        'Each file is one HTTPS request. The Last-Modified header says when it last changed; the oldest of the three counts, and it must be recent enough.',
        st.download,
        [codeCell('In', 'load.mjs', region('load.mjs', 'request'), 'The request'),
          codeCell('In', 'contract.mjs', region('contract.mjs', 'freshness'), 'The freshness rule')],
        outCell('Out', freshnessMeter(run), downloadTable(run))),
      step(2, 'Parse the text into rows',
        'A short CSV reader in plain JavaScript, with no library: commas end fields, line breaks end rows, quotes protect both.',
        st.parse,
        [codeCell('In', 'csv.mjs', region('csv.mjs', 'scan'), 'One pass over the text'),
          codeCell('In', 'load.mjs', region('load.mjs', 'parse'))],
        outCell('Out', rowBars(run))),
      step(3, 'Check the written contract',
        `${plural(n.rules, 'rule')}: ${n.tableRules} look at whole files, ${n.rowRules} at every row. A bad row is counted and not trusted; a row rule fails the run only when its share of bad rows goes over its tolerance.`,
        st.contract,
        contractCells(run),
        outCell('Out', ruleGrid(run))),
      step(4, 'The gate: pass or fail',
        'One question decides the run. Both outcomes are recorded, so a failure is visible, not silent.',
        st.gate,
        [codeCell('In', 'record.mjs', region('record.mjs', 'gate')), codeCell('In', 'run.mjs', region('run.mjs', 'exit'))],
        outCell('Out', fork(run), causeList(run))),
      step(5, 'Record the run',
        isSaved ? 'Every run is kept, passed or failed, newest last; the latest 52 stay. Pick a square to replay that run.'
          : 'Runs made in your browser are not saved. The weekly job saves its runs; pick a square to replay one.',
        st.record,
        [codeCell('In', 'run.mjs', region('run.mjs', 'record'))],
        outCell('Out', history())),
    );
  }

  function history() {
    const runs = data.runs;
    const strip = h('ol', { class: 'ar-history', 'aria-label': 'Saved runs, oldest first' });
    runs.forEach((r) => {
      const isOn = selected.run === r;
      strip.append(h('li', {}, h('button', {
        type: 'button',
        class: `ar-square is-${r.status}${r.deliberate ? ' is-rehearsal' : ''}${isOn ? ' is-on' : ''}`,
        title: `${S.fmtDate(r.runDate)} ${S.fmtTime(r.runDate)} · ${r.status}${r.deliberate ? ' · rehearsal' : ''}`,
        'aria-label': `${S.fmtDate(r.runDate)}, ${r.status}${r.deliberate ? ', rehearsal' : ''}`,
        'aria-pressed': isOn ? 'true' : 'false',
        onclick: () => select(r === realRun ? 'latest' : r === rehearsal ? 'rehearsal' : 'history', r),
      })));
    });
    const realCount = runs.filter((r) => !r.deliberate).length;
    const passCount = runs.filter((r) => !r.deliberate && r.status === 'pass').length;
    return h('div', {},
      strip,
      h('ul', { class: 'ar-legend' },
        h('li', {}, h('span', { class: 'ar-square is-pass', 'aria-hidden': 'true' }), 'passed'),
        h('li', {}, h('span', { class: 'ar-square is-fail', 'aria-hidden': 'true' }), 'failed'),
        h('li', {}, h('span', { class: 'ar-square is-fail is-rehearsal', 'aria-hidden': 'true' }), 'rehearsed break')),
      h('p', { class: 'ar-note', text: `${plural(runs.length, 'run')} saved: ${realCount} real (${passCount} passed), ${runs.length - realCount} rehearsed. Newest ${S.fmtDate(runs.at(-1).runDate)}.` }));
  }

  // ----- replay animation -----
  let playing = 0;
  async function replay() {
    if (reduceMotion()) return;
    const token = ++playing;
    const steps = [...stepsBox.querySelectorAll('.ar-step')];
    const dots = [...rail.querySelectorAll('li')];
    root.classList.add('is-replaying');
    steps.forEach((s) => s.classList.remove('is-shown', 'is-running'));
    dots.forEach((d) => d.classList.remove('is-shown', 'is-running'));
    for (let i = 0; i < steps.length; i++) {
      if (token !== playing) return;
      steps[i].classList.add('is-running');
      dots[i]?.classList.add('is-running');
      await sleep(i === 4 ? 700 : 420);
      if (token !== playing) return;
      steps[i].classList.replace('is-running', 'is-shown');
      dots[i]?.classList.replace('is-running', 'is-shown');
    }
    root.classList.remove('is-replaying');
  }

  // ----- run it yourself -----
  const liveBox = h('section', { class: 'ar-live', 'aria-label': 'Run the pipeline on today’s files' });

  function renderLive(stateText) {
    const lastFiles = [...data.runs].reverse().find((r) => r.files?.length)?.files;
    const size = lastFiles ? ` The last saved run downloaded ${S.fmtBytes(lastFiles.reduce((s, f) => s + f.bytes, 0))}.` : ' The three files add up to several megabytes.';
    const button = h('button', { type: 'button', class: 'ar-button is-primary', onclick: () => runLive(button) }, live ? 'Run again on today’s files' : 'Run it on today’s files');
    liveBox.replaceChildren(
      h('div', { class: 'ar-live-head' },
        h('div', {},
          h('h3', { text: 'Run it yourself' }),
          h('p', { text: `The same code, on today’s files, in your browser. Nothing is sent anywhere.${size} Works best on a computer.` })),
        button),
      stateText ? h('p', { class: 'ar-note', text: stateText }) : null,
      progress,
      live ? breakPanel() : null);
  }

  const progress = h('ol', { class: 'ar-progress' });
  function progressRow(table) {
    let row = progress.querySelector(`[data-table="${table}"]`);
    if (!row) {
      row = h('li', { 'data-table': table }, h('strong', { text: `${table}.csv` }), h('span', {}));
      progress.append(row);
    }
    return row.querySelector('span');
  }

  async function runLive(button) {
    button.disabled = true;
    progress.replaceChildren();
    try {
      const got = await fetchTables({
        onProgress: async ({ table, phase, file }) => {
          const cell = progressRow(table);
          if (phase === 'download') cell.textContent = 'downloading…';
          else if (phase === 'parse') cell.textContent = 'parsing…';
          else cell.textContent = `${S.fmtInt(file.rows)} rows · ${S.fmtBytes(file.bytes)} · ${S.fmtMs(file.fetchMs + file.parseMs)}`;
          await frame();
        },
      });
      const checking = h('li', {}, h('strong', { text: 'contract' }), h('span', { text: 'checking…' }));
      progress.append(checking);
      await frame();
      live = { tables: got.tables, lastModified: got.lastModified, files: got.files };
      const run = makeRun({ tables: live.tables, lastModified: live.lastModified, runDate: new Date().toISOString(), files: live.files });
      checking.querySelector('span').textContent = `${plural(run.checks.length, 'rule')} checked in ${S.fmtMs(run.checkMs)} · ${run.status}`;
      extra.live = run;
      extra.broken = null;
      renderLive();
      select('live', run);
    } catch (e) {
      live = null;
      renderLive(`The download did not finish: ${e && e.message ? e.message : 'unknown error'}. The saved runs above still work.`);
    } finally {
      button.disabled = false;
    }
  }

  function breakPanel() {
    const boxes = FAULTS.map((f) => h('label', { class: 'ar-fault' }, h('input', { type: 'checkbox', value: f.id }), h('span', { text: f.label })));
    const hint = h('p', { class: 'ar-note', role: 'status' });
    const go = h('button', {
      type: 'button', class: 'ar-button',
      onclick: async () => {
        const ids = boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
        if (!ids.length) { hint.textContent = 'Pick at least one break first.'; return; }
        hint.textContent = '';
        go.disabled = true;
        await frame();
        const runDate = new Date().toISOString();
        const broken = applyFaults({ tables: live.tables, lastModified: live.lastModified, runDate }, ids);
        const labels = FAULTS.filter((f) => ids.includes(f.id)).map((f) => f.label);
        extra.broken = makeRun({ tables: broken.tables, lastModified: broken.lastModified, runDate, deliberate: true, note: labels.join('; '), files: live.files });
        go.disabled = false;
        select('broken', extra.broken);
        document.getElementById('ar-step-gate')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      },
    }, 'Run the contract on the broken copy');
    return h('div', { class: 'ar-break' },
      h('h4', { text: 'Now break it' }),
      h('p', { text: 'Each break changes a copy of today’s files in memory, the way an upstream mistake would. Pick any, then run the contract again.' }),
      h('div', { class: 'ar-faults' }, boxes),
      go,
      hint);
  }

  // ----- assemble -----
  sourceNote.append(
    source === 'weekly'
      ? h('span', {}, 'Saved runs read from the ', h('a', { href: RUNS_BRANCH, target: '_blank', rel: 'noopener', text: 'airport-runs branch' }), ', which the weekly job updates.')
      : h('span', { text: 'Saved runs read from the copy published with this page. The weekly branch could not be read or is not newer.' }));

  root.replaceChildren(
    h('div', { class: 'ar-toolbar' }, picker, replayButton),
    sourceNote,
    rail,
    stepsBox,
    liveBox,
    status);
  renderPicker();
  renderSteps();
  renderLive();

  // Links elsewhere on the page, such as the hero's "Replay it", can open a given run.
  document.querySelectorAll('[data-airport-run]').forEach((a) => a.addEventListener('click', (ev) => {
    const key = a.getAttribute('data-airport-run') === 'rehearsal' ? 'rehearsal' : 'latest';
    const run = key === 'rehearsal' ? rehearsal : realRun;
    if (!run) return;
    ev.preventDefault();
    select(key, run, { animate: false });
    root.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    replay();
  }));

  // Play once when the replay first comes into view.
  if (typeof IntersectionObserver === 'function' && !reduceMotion()) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); replay(); }
    }, { threshold: 0.15 });
    io.observe(stepsBox);
  }
}

// ---------- the hero ----------

// The hero is rendered at build time from the saved runs. When the weekly branch has a newer run,
// the same functions fill it again here; the freshness badge is always worked out in the browser.
export function updateHero(data, nowMs = Date.now()) {
  const hero = document.querySelector('[data-airport-hero]');
  if (!hero) return;
  const set = (field, text) => hero.querySelectorAll(`[data-field="${field}"]`).forEach((n) => { n.textContent = text; });
  const run = S.latest(data, false);
  if (run) {
    const n = S.counts(run);
    set('status', run.status === 'pass' ? 'Pass' : 'Fail');
    set('date', S.fmtDate(run.runDate));
    set('headline', S.headline(run, READS));
    set('rows', S.fmtInt(S.rowsChecked(run)));
    set('rules', S.fmtInt(n.rules));
    set('rules-split', `${n.tableRules} on whole files, ${n.rowRules} on every row`);
    set('age', String(run.freshness.ageDays));
    hero.classList.toggle('is-fail', run.status !== 'pass');
  }
  const rehearsal = S.latest(data, true);
  if (rehearsal) set('rehearsal', S.headline(rehearsal, READS));
  const badge = S.freshnessBadge(data, nowMs);
  const badgeEl = hero.querySelector('[data-field="badge"]');
  if (badgeEl) {
    badgeEl.hidden = false;
    badgeEl.className = `ah-badge is-${badge.state}`;
    badgeEl.textContent = badge.state === 'none' ? 'No passed run saved'
      : badge.state === 'stale' ? `Stale: last pass ${S.fmtDays(badge.days)} ago`
        : `Fresh: last pass ${badge.days === 0 ? 'today' : `${S.fmtDays(badge.days)} ago`}`;
  }
}
