// Plain summaries of airport-contract run records, for the Lab page. Pure functions, used at build
// time and in the browser; tested in scripts/airport-page.test.mjs. Every figure on the page comes
// from a run record through one of these.
import { MAX_AGE_DAYS } from '../../../pipelines/airport-contract/contract.mjs';

export const STALE_AFTER_DAYS = 8; // a weekly run plus one day of slack
export const TABLE_ORDER = ['airports', 'runways', 'countries'];
const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const numberFormat = new Intl.NumberFormat('en-GB');

export const fmtInt = (n) => numberFormat.format(n);
export function fmtDate(iso) {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}
export function fmtBytes(bytes) {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} bytes`;
}
export const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
export function fmtShare(failed, checked) {
  if (!checked || !failed) return '0%';
  const p = (failed / checked) * 100;
  if (p >= 99.95) return '100%';
  return `${p >= 1 ? Number(p.toFixed(1)) : Number(p.toPrecision(2))}%`;
}
export const fmtTolerance = (t) => (t ? `${Number((t * 100).toPrecision(3))}%` : 'none');
export const fmtDays = (d) => `${d} ${d === 1 ? 'day' : 'days'}`;

// pass: no bad rows. tolerated: bad rows found but under the tolerance, so the rule still passes.
export const checkState = (c) => (!c.passed ? 'fail' : c.failed > 0 ? 'tolerated' : 'pass');

export function counts(run) {
  const n = { rules: run.checks.length, pass: 0, tolerated: 0, fail: 0, tableRules: 0, rowRules: 0 };
  for (const c of run.checks) {
    n[checkState(c)]++;
    n[c.level === 'table' ? 'tableRules' : 'rowRules']++;
  }
  return n;
}

export const rowsChecked = (run) => TABLE_ORDER.reduce((sum, t) => sum + (run.rows[t] ?? 0), 0);

export function groupByTable(run) {
  return TABLE_ORDER.map((table) => ({ table, rows: run.rows[table] ?? 0, checks: run.checks.filter((c) => c.table === table) }))
    .filter((g) => g.checks.length);
}

// The latest real run (deliberate false) or the latest rehearsal (deliberate true).
export const latest = (data, deliberate) => [...data.runs].reverse().find((r) => Boolean(r.deliberate) === deliberate);
export const lastPass = (data) => [...data.runs].reverse().find((r) => !r.deliberate && r.status === 'pass');

// Worked out in the browser from the saved run date, so it goes stale by itself if runs stop.
export function freshnessBadge(data, nowMs) {
  const run = lastPass(data);
  if (!run) return { state: 'none' };
  const days = Math.max(0, Math.floor((nowMs - Date.parse(run.runDate)) / DAY));
  return { state: days > STALE_AFTER_DAYS ? 'stale' : 'fresh', days, runDate: run.runDate };
}

// Why a run failed, one entry per cause. A missing column makes every rule that reads it fail on
// every row, so those rules are listed under the missing column, not as causes of their own.
// reads: { checkId: ['table.column', ...] } from readsById() in the contract.
export function causes(run, reads = {}) {
  const failing = run.checks.filter((c) => !c.passed);
  const explained = new Set();
  const out = [];
  for (const m of failing.filter((c) => c.level === 'table' && c.id.endsWith('.columns'))) {
    const columns = m.samples.map((s) => s.replace(/^missing column /, ''));
    const qualified = columns.map((col) => `${m.table}.${col}`);
    const follow = failing.filter((c) => c.level === 'row' && (reads[c.id] ?? []).some((col) => qualified.includes(col)));
    explained.add(m.id);
    for (const c of follow) explained.add(c.id);
    out.push({ kind: 'columns', id: m.id, table: m.table, columns, follow: follow.map((c) => c.id) });
  }
  for (const c of failing) {
    if (explained.has(c.id)) continue;
    if (c.level === 'table') out.push({ kind: 'table', id: c.id, table: c.table, says: c.says, samples: c.samples });
    else out.push({ kind: 'rows', id: c.id, table: c.table, says: c.says, failed: c.failed, checked: c.checked, tolerance: c.tolerance, samples: c.samples });
  }
  if (!run.freshness.ok) out.push({ kind: 'stale', ageDays: run.freshness.ageDays });
  return out;
}

// Rules that failed only because a column they read is missing, by check id -> the column.
export function followers(run, reads = {}) {
  const map = {};
  for (const c of causes(run, reads)) if (c.kind === 'columns') for (const id of c.follow) map[id] = `${c.table}.${c.columns[0]}`;
  return map;
}

// One sentence on the outcome of a run, for the hero card and the route.
export function headline(run, reads = {}) {
  if (run.status === 'pass') {
    const tolerated = run.checks.filter((c) => checkState(c) === 'tolerated');
    if (!tolerated.length) return `Every rule passed on all ${fmtInt(rowsChecked(run))} rows.`;
    const t = tolerated[0];
    const more = tolerated.length > 1 ? ` ${tolerated.length - 1} more rule${tolerated.length > 2 ? 's' : ''} did the same.` : '';
    return `${fmtInt(t.failed)} ${t.failed === 1 ? 'row' : 'rows'} in ${t.table} broke one rule: ${fmtShare(t.failed, t.checked)}, inside the ${fmtTolerance(t.tolerance)} allowed, so the run still passes.${more}`;
  }
  const list = causes(run, reads);
  const first = list[0];
  const more = list.length > 1 ? ` ${list.length - 1} more cause${list.length > 2 ? 's' : ''} below.` : '';
  return `${causeSentence(first)}${more}`;
}

export function causeSentence(c) {
  if (!c) return 'The run failed.';
  if (c.kind === 'columns') {
    const cols = c.columns.join(', ');
    const follow = c.follow.length ? ` ${c.follow.length} more ${c.follow.length === 1 ? 'rule' : 'rules'} failed because ${c.follow.length === 1 ? 'it reads' : 'they read'} it.` : '';
    return `The ${c.table} file has no ${cols} column.${follow}`;
  }
  if (c.kind === 'table') return `${capital(c.says)}: failed (${c.samples.join('; ')}).`;
  if (c.kind === 'rows') return `${fmtInt(c.failed)} of ${fmtInt(c.checked)} ${c.table} rows break the rule “${c.says}”.`;
  return `The files last changed ${fmtDays(c.ageDays)} before the run. The contract allows ${MAX_AGE_DAYS}.`;
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
