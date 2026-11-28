// Readers and checks for the lab's inputs. Each reader returns rows; each check returns
// { id, says, failed } with failed = 0 for a pass. Every check has tolerance zero.
import { parseCsv } from '../airport-contract/csv.mjs';
import { dayNumber, isoDay } from './calendar.mjs';

export const SUBSYSTEMS = ['N', 'NE', 'S', 'SE'];
export const SUBSYSTEM_NAMES = { N: 'North', NE: 'Northeast', S: 'South', SE: 'Southeast/Centre-West' };
const ONS_COLUMNS = ['id_subsistema', 'nom_subsistema', 'din_instante', 'val_cargaenergiahomwmed'];
// The night clocks went forward for daylight saving in these years: the hour from 00:00 did not
// exist, and the 2018 file leaves it empty (or zero, in the South). That one hour is not a fault;
// its day is left out of every comparison because it has 23 real hours.
export const CLOCK_FORWARD = ['2018-11-04 00:00:00'];

/** Semicolon-separated ONS file to objects (ONS files hold no quoted fields). */
export function parseSemicolon(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const [head, ...lines] = text.split(/\r?\n/).filter((l) => l !== '');
  const columns = head.split(';');
  return { columns, rows: lines.map((l) => Object.fromEntries(l.split(';').map((v, i) => [columns[i], v.trim()]))) };
}

/**
 * ONS hourly load: one row per subsystem and hour, value in MWmed (the mean power over the hour,
 * so one hour's value is also its energy in MWh). Returns the rows and the checks on one year's file.
 */
export function readHourly(text, year) {
  const { columns, rows } = parseSemicolon(text);
  const checks = [];
  const missing = ONS_COLUMNS.filter((c) => !columns.includes(c));
  checks.push({ id: 'load.columns', says: `CURVA_CARGA_${year}: the four columns of the data dictionary`, failed: missing.length });
  if (missing.length) return { rows: [], checks };

  const out = [];
  let badSub = 0;
  let badTime = 0;
  let badValue = 0;
  let clockGap = 0;
  for (const r of rows) {
    const sub = r.id_subsistema;
    const t = r.din_instante;
    const v = Number(r.val_cargaenergiahomwmed);
    if (!SUBSYSTEMS.includes(sub)) badSub += 1;
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:00:00$/.test(t) || +t.slice(0, 4) !== year || +t.slice(11, 13) > 23) badTime += 1;
    const empty = r.val_cargaenergiahomwmed === '';
    if (CLOCK_FORWARD.includes(t) && (empty || v === 0)) {
      clockGap += 1;
      out.push({ subsystem: sub, date: t.slice(0, 10), hour: +t.slice(11, 13), mw: NaN });
      continue;
    }
    if (empty || !Number.isFinite(v) || v < 0) badValue += 1;
    out.push({ subsystem: sub, date: t.slice(0, 10), hour: +t.slice(11, 13), mw: v });
  }
  checks.push({ id: 'load.subsystem', says: `CURVA_CARGA_${year}: every subsystem code is N, NE, S or SE`, failed: badSub });
  checks.push({ id: 'load.instant', says: `CURVA_CARGA_${year}: every instant is a whole hour in ${year}`, failed: badTime });
  checks.push({ id: 'load.value', says: `CURVA_CARGA_${year}: every value is present, a number and not negative (data dictionary), except the hour skipped when clocks went forward`, failed: badValue, clock_forward_hours: clockGap });

  // Every subsystem has every hour of the year exactly once.
  const seen = new Map();
  for (const r of out) {
    const k = `${r.subsystem}|${r.date}|${r.hour}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  let dupes = 0;
  for (const n of seen.values()) if (n > 1) dupes += n - 1;
  checks.push({ id: 'load.unique', says: `CURVA_CARGA_${year}: each subsystem and hour appears once`, failed: dupes });
  let gaps = 0;
  for (let n = dayNumber(`${year}-01-01`); n <= dayNumber(`${year}-12-31`); n += 1) {
    const d = isoDay(n);
    for (const s of SUBSYSTEMS) for (let h = 0; h < 24; h += 1) if (!seen.has(`${s}|${d}|${h}`)) gaps += 1;
  }
  checks.push({ id: 'load.complete', says: `CURVA_CARGA_${year}: every subsystem has all 24 hours of every day`, failed: gaps });
  // A zero is allowed by the dictionary, but a zero in a whole subsystem's load is an outage of the
  // record, not of the grid. Counted, not failed: the analysis drops days that hold one.
  const zeros = out.filter((r) => r.mw === 0).length;
  checks.push({ id: 'load.zero_hours', says: `CURVA_CARGA_${year}: hours with a load of exactly zero (counted; days holding one are left out)`, failed: 0, count: zeros });
  return { rows: out, checks };
}

/** OxCGRT extract: stringency (0 to 100) by state and day. */
export function readStringency(text) {
  const { rows } = parseCsv(text);
  const checks = [];
  const out = [];
  let bad = 0;
  for (const r of rows) {
    const v = r.StringencyIndex_Average === '' ? NaN : Number(r.StringencyIndex_Average);
    if (!Number.isFinite(v) || v < 0 || v > 100 || r.Jurisdiction !== 'STATE_TOTAL') bad += 1;
    const d = r.Date;
    out.push({ state: r.RegionCode.replace(/^BR_/, ''), date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, stringency: v });
  }
  checks.push({ id: 'policy.value', says: 'OxCGRT: every state row is STATE_TOTAL with a stringency from 0 to 100', failed: bad });
  const states = new Set(out.map((r) => r.state));
  checks.push({ id: 'policy.states', says: 'OxCGRT: all 27 federative units (26 states and the Federal District) are present', failed: Math.max(0, 27 - states.size) });
  const days = dayNumber('2021-12-31') - dayNumber('2020-01-01') + 1;
  const perState = new Map();
  for (const r of out) perState.set(r.state, (perState.get(r.state) ?? 0) + 1);
  let short = 0;
  for (const n of perState.values()) short += Math.abs(days - n);
  checks.push({ id: 'policy.complete', says: `OxCGRT: each state has one row for each of the ${days} days of 2020 and 2021`, failed: short });
  return { rows: out, checks };
}

/** BCB SGS JSON: [{ data: 'DD/MM/YYYY', valor: '12.3' }] to [{ month: 'YYYY-MM', value }]. */
export function readSgs(text, series) {
  const raw = JSON.parse(text);
  const rows = raw.map((r) => ({ month: `${r.data.slice(6, 10)}-${r.data.slice(3, 5)}`, value: Number(r.valor) }));
  const bad = rows.filter((r) => !Number.isFinite(r.value) || r.value <= 0).length;
  const months = new Set(rows.map((r) => r.month));
  const want = [];
  for (let y = 2017; y <= 2021; y += 1) for (let m = 1; m <= 12; m += 1) want.push(`${y}-${String(m).padStart(2, '0')}`);
  const missing = want.filter((m) => !months.has(m)).length;
  return {
    rows,
    checks: [
      { id: `activity.${series}.value`, says: `IBC-Br ${series}: every month is a positive number`, failed: bad },
      { id: `activity.${series}.complete`, says: `IBC-Br ${series}: all 60 months from January 2017 to December 2021`, failed: missing },
    ],
  };
}
