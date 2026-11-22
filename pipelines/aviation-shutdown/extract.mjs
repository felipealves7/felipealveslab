// BTS Reporting Carrier On-Time Performance -> daily flight totals for 1 September to 30 November 2025:
// by exposure to the FAA's November 2025 flight cuts (listed airports at both ends, one end or neither),
// and by origin airport. Each flight is counted once in each file.
//
// Usage: NODE_USE_ENV_PROXY=1 node pipelines/aviation-shutdown/extract.mjs --cache <folder>
// The folder holds BTS's monthly archives. Missing months are downloaded from
// https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_<year>_<month>.zip
// Writes data/aviation-shutdown/daily-exposure.csv, daily-airport.csv and extract.json.
// Counting follows data/aviation-reliability/metric-contract.json: an observed arrival is not cancelled,
// not diverted and has a signed arrival delay; on time means arriving less than 15 minutes late.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORDER_SOURCE, HIGH_IMPACT, exposure, isListed, cutOn } from './order.mjs';

export const MONTHS = Object.freeze([[2025, 9], [2025, 10], [2025, 11]]);
export const FIELDS = Object.freeze(['FlightDate', 'Origin', 'Dest', 'Cancelled', 'CancellationCode', 'Diverted', 'ArrDelay']);
export const TOTALS = Object.freeze(['scheduled', 'cancelled', 'cancelled_nas', 'diverted', 'observed_arrivals', 'on_time', 'arrival_delay_sum', 'positive_delay_sum']);
export const archiveName = (y, m) => `On_Time_Reporting_Carrier_On_Time_Performance_1987_present_${y}_${m}.zip`;
export const archiveUrl = (y, m) => `https://transtats.bts.gov/PREZIP/${archiveName(y, m)}`;

/** Split one CSV line: commas end fields, double quotes protect them, "" is a quote. */
export function splitCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

export const newTotals = () => Object.fromEntries(TOTALS.map((k) => [k, 0]));

/** One BTS row -> the fields the totals need. Flags are "1.00" or "0.00"; a missing delay is "". */
export function parseFlight(cols, idx) {
  const delay = cols[idx.ArrDelay].trim();
  return {
    date: cols[idx.FlightDate],
    origin: cols[idx.Origin],
    dest: cols[idx.Dest],
    cancelled: Number(cols[idx.Cancelled]) === 1,
    code: cols[idx.CancellationCode].trim(),
    diverted: Number(cols[idx.Diverted]) === 1,
    arrDelay: delay === '' ? null : Number(delay),
  };
}

/** Add one flight to a set of totals, by the Lab's metric contract. */
export function addFlight(t, f) {
  t.scheduled += 1;
  if (f.cancelled) {
    t.cancelled += 1;
    if (f.code === 'C') t.cancelled_nas += 1;
    return;
  }
  if (f.diverted) { t.diverted += 1; return; }
  if (f.arrDelay === null || Number.isNaN(f.arrDelay)) return;
  t.observed_arrivals += 1;
  if (f.arrDelay < 15) t.on_time += 1;
  t.arrival_delay_sum += f.arrDelay;
  t.positive_delay_sum += Math.max(0, f.arrDelay);
}

/** Totals keyed "date|group", built from an iterable of flights. */
export function aggregate(flights, groupOf) {
  const map = new Map();
  for (const f of flights) {
    const key = `${f.date}|${groupOf(f)}`;
    if (!map.has(key)) map.set(key, newTotals());
    addFlight(map.get(key), f);
  }
  return map;
}

export function toCsv(map, groupColumn, extra = () => ({})) {
  const keys = [...map.keys()].sort();
  const extraCols = keys.length ? Object.keys(extra(...keys[0].split('|'))) : [];
  const head = ['date', groupColumn, ...extraCols, ...TOTALS];
  const lines = [head.join(',')];
  for (const key of keys) {
    const [date, group] = key.split('|');
    const e = extra(date, group);
    lines.push([date, group, ...extraCols.map((c) => e[c]), ...TOTALS.map((k) => map.get(key)[k])].join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** The archive's CSV member; BTS archives also hold a readme. */
export function csvMember(listing) {
  const csv = listing.split('\n').map((s) => s.trim()).filter((s) => s.toLowerCase().endsWith('.csv'));
  if (csv.length !== 1) throw new Error(`expected one CSV in the archive, found ${csv.length}`);
  return csv[0];
}

async function* flightsIn(zipPath) {
  const member = csvMember(execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }));
  const unzip = spawn('unzip', ['-p', zipPath, member], { stdio: ['ignore', 'pipe', 'inherit'] });
  const lines = createInterface({ input: unzip.stdout, crlfDelay: Infinity });
  let idx = null;
  for await (const raw of lines) {
    const line = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    if (!line) continue;
    const cols = splitCsvLine(line);
    if (!idx) {
      idx = Object.fromEntries(FIELDS.map((f) => [f, cols.indexOf(f)]));
      const missing = FIELDS.filter((f) => idx[f] < 0);
      if (missing.length) throw new Error(`${zipPath}: no column ${missing.join(', ')}`);
      continue;
    }
    yield parseFlight(cols, idx);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--cache');
  if (at < 0 || !args[at + 1]) throw new Error('usage: extract.mjs --cache <folder>');
  const cache = args[at + 1];
  mkdirSync(cache, { recursive: true });
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const files = [];
  const byExposure = new Map();
  const byAirport = new Map();
  for (const [y, m] of MONTHS) {
    const path = join(cache, archiveName(y, m));
    let lastModified = null;
    if (existsSync(path)) {
      // Record BTS's date for a cached archive too, when the site answers; offline runs leave it null.
      lastModified = await fetch(archiveUrl(y, m), { method: 'HEAD' })
        .then((r) => (r.ok ? r.headers.get('last-modified') : null)).catch(() => null);
    } else {
      const res = await fetch(archiveUrl(y, m));
      if (!res.ok) throw new Error(`${archiveUrl(y, m)}: HTTP ${res.status}`);
      lastModified = res.headers.get('last-modified');
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    }
    const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
    let rows = 0;
    for await (const f of flightsIn(path)) {
      rows += 1;
      for (const [map, key] of [[byExposure, `${f.date}|${exposure(f.origin, f.dest)}`], [byAirport, `${f.date}|${f.origin}`]]) {
        if (!map.has(key)) map.set(key, newTotals());
        addFlight(map.get(key), f);
      }
    }
    files.push({ period: `${y}-${String(m).padStart(2, '0')}`, url: archiveUrl(y, m), file: archiveName(y, m), sha256, bytes: statSync(path).size, last_modified: lastModified, rows });
    console.log(`${y}-${m}: ${rows} rows`);
  }
  const out = join(root, 'data/aviation-shutdown');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'daily-exposure.csv'), toCsv(byExposure, 'exposure', (date) => ({ cut: cutOn(date) })));
  writeFileSync(join(out, 'daily-airport.csv'), toCsv(byAirport, 'origin', (date, origin) => ({ high_impact: isListed(origin) ? 1 : 0, cut: cutOn(date) })));
  const extract = {
    generated: new Date().toISOString().slice(0, 10),
    source: 'US Bureau of Transportation Statistics, Reporting Carrier On-Time Performance (1987-present)',
    order: ORDER_SOURCE,
    high_impact: HIGH_IMPACT,
    files,
    rows_total: files.reduce((s, f) => s + f.rows, 0),
  };
  writeFileSync(join(out, 'extract.json'), `${JSON.stringify(extract, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
