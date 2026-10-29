// One run record: the contract result, freshness and counts for one set of tables. Pure functions,
// shared by the weekly runner (Node) and the Lab page (browser).
import { runContract, freshness } from './contract.mjs';
import { TABLES } from './load.mjs';

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Rename a column in place, to rehearse an upstream break. Used by run.mjs --rename.
export function applyRename(tables, spec) {
  const [target, to] = spec.split('=');
  const [table, from] = target.split('.');
  const t = tables[table];
  t.columns = t.columns.map((c) => (c === from ? to : c));
  t.rows = t.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k === from ? to : k, v])));
}

// files: optional download records from fetchTables (size, timings). When given, the time the
// contract took is recorded too.
export function makeRun({ tables, lastModified, runDate, deliberate = false, note = '', files }) {
  const started = clock();
  const contract = runContract(tables);
  const checkMs = Math.round(clock() - started);
  const fresh = freshness(lastModified, runDate);
  // #region gate
  // A run passes only when every check passes and the upstream files are fresh enough.
  const status = contract.status === 'pass' && fresh.ok ? 'pass' : 'fail';
  // #endregion
  const run = {
    runDate,
    status,
    deliberate,
    note,
    freshness: fresh,
    rows: Object.fromEntries(TABLES.map((t) => [t, tables[t].rows.length])),
    columns: Object.fromEntries(TABLES.map((t) => [t, tables[t].columns.length])),
    checks: contract.checks,
  };
  if (files) {
    run.files = files;
    run.checkMs = checkMs;
  }
  return run;
}
