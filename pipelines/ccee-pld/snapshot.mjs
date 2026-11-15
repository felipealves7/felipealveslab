// Snapshots and revision tracking. A snapshot is one download of the files. Each run records a
// fingerprint per month (SHA-256 of the month's rows, sorted), so a later run can say which months
// CCEE rewrote even when the old files are gone. With the old files at hand, compareRows says which
// hourly values changed, which were added and which went missing.
import { createHash } from 'node:crypto';
import { rowKey } from './load.mjs';

/** { 'YYYYMM': sha256 } over the rows of each month, independent of quoting, line endings and order. */
export function monthDigests(files) {
  const byMonth = new Map();
  for (const f of files) for (const r of f.rows) {
    const line = `${rowKey(r)}|${Number(r.PERIODO_COMERCIALIZACAO)}|${r.PLD_HORA}`;
    if (!byMonth.has(r.MES_REFERENCIA)) byMonth.set(r.MES_REFERENCIA, []);
    byMonth.get(r.MES_REFERENCIA).push(line);
  }
  const out = {};
  for (const m of [...byMonth.keys()].sort()) out[m] = createHash('sha256').update(byMonth.get(m).sort().join('\n')).digest('hex');
  return out;
}

/** Months rewritten, added or gone between two snapshots' month fingerprints. */
export function compareDigests(before, after) {
  const changed = [];
  const added = [];
  const removed = [];
  for (const m of Object.keys(after)) {
    if (!(m in before)) added.push(m);
    else if (before[m] !== after[m]) changed.push(m);
  }
  for (const m of Object.keys(before)) if (!(m in after)) removed.push(m);
  return { changed: changed.sort(), added: added.sort(), removed: removed.sort() };
}

/**
 * Hour-level comparison of two downloads. Returns the values that changed, the keys that went missing,
 * and the number of new keys. New hours at the end of the series are expected: CCEE publishes the
 * next day every day. A missing or changed hour is a restatement worth a look before a report goes out.
 */
export function compareRows(beforeFiles, afterFiles) {
  const before = new Map();
  for (const f of beforeFiles) for (const r of f.rows) before.set(rowKey(r), r.PLD_HORA);
  const changed = [];
  let added = 0;
  const seen = new Set();
  for (const f of afterFiles) for (const r of f.rows) {
    const k = rowKey(r);
    seen.add(k);
    if (!before.has(k)) added++;
    else if (Number(before.get(k)) !== Number(r.PLD_HORA)) changed.push({ key: k, before: Number(before.get(k)), after: Number(r.PLD_HORA) });
  }
  const removed = [...before.keys()].filter((k) => !seen.has(k)).sort();
  return { changed: changed.sort((a, b) => (a.key < b.key ? -1 : 1)), removed, added };
}
