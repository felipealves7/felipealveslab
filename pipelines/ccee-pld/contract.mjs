// The written data contract for CCEE's hourly PLD files (PLD_HORARIO). 13 checks in three scopes:
//   file  - one check per file (the columns). A failure fails the run.
//   row   - looked at row by row. Bad rows are counted; any bad row fails the run (tolerance 0).
//   set   - looked at across all files together: whole days, all submarkets, no gaps, freshness.
// Every check lists the columns it reads. When a column is missing, the checks that read it are
// marked "not run" and reported under that one cause, instead of as separate failures.

export const COLUMNS = ['MES_REFERENCIA', 'SUBMERCADO', 'PERIODO_COMERCIALIZACAO', 'DIA', 'HORA', 'PLD_HORA'];
export const SUBMARKETS = ['NORDESTE', 'NORTE', 'SUDESTE', 'SUL'];
// Sanity bounds in R$/MWh, chosen for this contract to catch unit or decimal errors. They are not
// CCEE's regulatory floor and ceiling, which this repository has not verified.
export const PRICE_BOUNDS = [1, 5000];
// The newest priced day may be at most this many days before the retrieval date.
export const MAX_AGE_DAYS = 3;
export const FIRST_DAY = '2021-01-01';

const INT = /^\d+$/;
const PRICE = /^\d+(\.\d{1,2})?$/;
const MAX_EXAMPLES = 3;

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const keyOf = (r) => `${r.MES_REFERENCIA}|${r.SUBMERCADO}|${Number(r.DIA)}|${Number(r.HORA)}`;
const dateOf = (r) => `${r.MES_REFERENCIA.slice(0, 4)}-${r.MES_REFERENCIA.slice(4, 6)}-${String(Number(r.DIA)).padStart(2, '0')}`;
export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

function monthOk(r, year) {
  const m = /^(\d{4})(\d{2})$/.exec(r.MES_REFERENCIA);
  return Boolean(m) && Number(m[1]) === year && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

// Row checks: test(row, file) returns null for a good row or a short reason for a bad one.
const ROW_CHECKS = [
  { id: 'row.month', says: 'MES_REFERENCIA is a month (YYYYMM) in the file\'s year', reads: ['MES_REFERENCIA'],
    test: (r, f) => (monthOk(r, f.year) ? null : `MES_REFERENCIA=${r.MES_REFERENCIA}`) },
  { id: 'row.submarket', says: `SUBMERCADO is one of ${SUBMARKETS.join(', ')}`, reads: ['SUBMERCADO'],
    test: (r) => (SUBMARKETS.includes(r.SUBMERCADO) ? null : `SUBMERCADO=${r.SUBMERCADO}`) },
  { id: 'row.day', says: 'DIA is a day that exists in that month', reads: ['MES_REFERENCIA', 'DIA'],
    test: (r, f) => {
      if (!monthOk(r, f.year)) return null; // reported by row.month
      const d = Number(r.DIA);
      return INT.test(r.DIA) && d >= 1 && d <= daysInMonth(f.year, Number(r.MES_REFERENCIA.slice(4))) ? null : `DIA=${r.DIA}`;
    } },
  { id: 'row.hour', says: 'HORA is a whole hour from 0 to 23', reads: ['HORA'],
    test: (r) => (INT.test(r.HORA) && Number(r.HORA) <= 23 ? null : `HORA=${r.HORA}`) },
  { id: 'row.period', says: 'PERIODO_COMERCIALIZACAO equals (DIA - 1) x 24 + HORA + 1, the hour count within the month', reads: ['PERIODO_COMERCIALIZACAO', 'DIA', 'HORA'],
    test: (r) => (Number(r.PERIODO_COMERCIALIZACAO) === (Number(r.DIA) - 1) * 24 + Number(r.HORA) + 1 ? null : `PERIODO=${r.PERIODO_COMERCIALIZACAO} for DIA=${r.DIA} HORA=${r.HORA}`) },
  { id: 'row.price_number', says: 'PLD_HORA is a number with at most two decimals, dot as decimal mark', reads: ['PLD_HORA'],
    test: (r) => (PRICE.test(r.PLD_HORA) ? null : `PLD_HORA=${r.PLD_HORA}`) },
  { id: 'row.price_bounds', says: `PLD_HORA is between ${PRICE_BOUNDS[0].toLocaleString('en-GB')} and ${PRICE_BOUNDS[1].toLocaleString('en-GB')} R$/MWh (sanity bounds)`, reads: ['PLD_HORA'],
    test: (r) => {
      if (!PRICE.test(r.PLD_HORA)) return null; // reported by row.price_number
      const v = Number(r.PLD_HORA);
      return v >= PRICE_BOUNDS[0] && v <= PRICE_BOUNDS[1] ? null : `PLD_HORA=${r.PLD_HORA}`;
    } },
];

const KEY_COLS = ['MES_REFERENCIA', 'SUBMERCADO', 'DIA', 'HORA'];

// Set checks see every row of every file. Each returns a list of problems (empty when it passes)
// and the number of things it looked at.
const SET_CHECKS = [
  { id: 'set.key_unique', says: 'Each month, submarket, day and hour appears once across all files', reads: KEY_COLS,
    test: ({ rows }) => {
      const seen = new Set();
      const bad = [];
      for (const r of rows) { const k = keyOf(r); if (seen.has(k)) bad.push(`repeated ${k}`); seen.add(k); }
      return { bad, total: rows.length };
    } },
  { id: 'set.day_24_hours', says: 'Every submarket has exactly the 24 hours 0 to 23 on every day (a 23- or 25-hour daylight-saving day fails)', reads: KEY_COLS,
    test: ({ rows }) => {
      const hours = new Map();
      for (const r of rows) {
        const k = `${dateOf(r)} ${r.SUBMERCADO}`;
        if (!hours.has(k)) hours.set(k, []);
        hours.get(k).push(Number(r.HORA));
      }
      const bad = [];
      for (const [k, hs] of hours) {
        const set = new Set(hs);
        const whole = hs.length === 24 && set.size === 24 && [...set].every((h) => h >= 0 && h <= 23);
        if (!whole) bad.push(`${k}: ${hs.length} rows`);
      }
      return { bad, total: hours.size };
    } },
  { id: 'set.all_submarkets', says: 'Every day and hour has a price for all four submarkets', reads: KEY_COLS,
    test: ({ rows }) => {
      const subs = new Map();
      for (const r of rows) {
        const k = `${dateOf(r)} h${Number(r.HORA)}`;
        if (!subs.has(k)) subs.set(k, new Set());
        subs.get(k).add(r.SUBMERCADO);
      }
      const bad = [];
      for (const [k, s] of subs) if (!SUBMARKETS.every((x) => s.has(x))) bad.push(`${k}: ${[...s].sort().join(', ')}`);
      return { bad, total: subs.size };
    } },
  { id: 'set.no_missing_days', says: `Every calendar day from ${FIRST_DAY} to the newest day is present`, reads: ['MES_REFERENCIA', 'DIA'],
    test: ({ rows }) => {
      const days = new Set(rows.map(dateOf));
      const last = [...days].sort().at(-1) ?? FIRST_DAY;
      const bad = [];
      let n = 0;
      for (let d = FIRST_DAY; d <= last; d = addDays(d, 1)) { n++; if (!days.has(d)) bad.push(`missing ${d}`); }
      return { bad, total: n };
    } },
  { id: 'set.fresh', says: `The newest priced day is at most ${MAX_AGE_DAYS} days before the retrieval date`, reads: ['MES_REFERENCIA', 'DIA'],
    test: ({ rows, retrieved }) => {
      const last = rows.map(dateOf).sort().at(-1);
      const age = last ? daysBetween(last, retrieved) : Infinity;
      return { bad: age <= MAX_AGE_DAYS ? [] : [`newest day ${last ?? 'none'}, ${age} days before ${retrieved}`], total: 1 };
    } },
];

/** The contract as written, for the page and the README. */
export function describeContract() {
  return [
    { id: 'file.columns', scope: 'file', says: `Each file has the ${COLUMNS.length} columns ${COLUMNS.join(', ')}`, reads: [] },
    ...ROW_CHECKS.map(({ id, says, reads }) => ({ id, scope: 'row', says, reads })),
    ...SET_CHECKS.map(({ id, says, reads }) => ({ id, scope: 'set', says, reads })),
  ];
}

const first = (list) => list.slice(0, MAX_EXAMPLES);

/**
 * Run the contract. files: [{ name, year, columns, rows }], rows as raw strings from load.mjs.
 * retrieved: ISO date the files were downloaded. Returns { status, checks, causes }.
 */
export function runContract(files, retrieved) {
  const checks = [];
  const missingCols = new Set();
  const colBad = [];
  for (const f of files) {
    for (const c of COLUMNS) if (!f.columns.includes(c)) { colBad.push(`${f.name}: missing ${c}`); missingCols.add(c); }
  }
  checks.push({ id: 'file.columns', scope: 'file', says: describeContract()[0].says, reads: [], status: colBad.length ? 'fail' : 'pass', bad: colBad.length, total: files.length * COLUMNS.length, examples: first(colBad) });

  const blocked = (reads) => reads.filter((c) => missingCols.has(c));

  for (const chk of ROW_CHECKS) {
    const lacking = blocked(chk.reads);
    if (lacking.length) { checks.push({ id: chk.id, scope: 'row', says: chk.says, reads: chk.reads, status: 'not run', blockedBy: lacking, bad: 0, total: 0, examples: [] }); continue; }
    let bad = 0;
    let total = 0;
    const examples = [];
    for (const f of files) {
      for (const r of f.rows) {
        total++;
        const why = chk.test(r, f);
        if (why !== null) { bad++; if (examples.length < MAX_EXAMPLES) examples.push(`${f.name}: ${why}`); }
      }
    }
    checks.push({ id: chk.id, scope: 'row', says: chk.says, reads: chk.reads, status: bad ? 'fail' : 'pass', bad, total, examples });
  }

  // Set checks only see rows whose key fields are readable, so one bad field is not counted twice.
  const rows = files.flatMap((f) => f.rows.filter((r) => monthOk(r, f.year) && INT.test(r.DIA ?? '') && INT.test(r.HORA ?? '')));
  for (const chk of SET_CHECKS) {
    const lacking = blocked(chk.reads);
    if (lacking.length) { checks.push({ id: chk.id, scope: 'set', says: chk.says, reads: chk.reads, status: 'not run', blockedBy: lacking, bad: 0, total: 0, examples: [] }); continue; }
    const { bad, total } = chk.test({ rows, retrieved });
    checks.push({ id: chk.id, scope: 'set', says: chk.says, reads: chk.reads, status: bad.length ? 'fail' : 'pass', bad: bad.length, total, examples: first(bad) });
  }

  // One cause per missing column (with the checks it stopped), then one per other failed check.
  const causes = [];
  for (const c of missingCols) {
    causes.push({
      cause: `Column ${c} is missing from ${files.filter((f) => !f.columns.includes(c)).map((f) => f.name).join(', ')}`,
      checks: ['file.columns', ...checks.filter((k) => k.blockedBy?.includes(c)).map((k) => k.id)],
    });
  }
  for (const k of checks) if (k.status === 'fail' && k.id !== 'file.columns') causes.push({ cause: `${k.id}: ${k.bad} of ${k.total} failed`, checks: [k.id] });

  const failed = checks.some((k) => k.status === 'fail' || k.status === 'not run');
  return { status: failed ? 'failed' : 'passed', checks, causes };
}
