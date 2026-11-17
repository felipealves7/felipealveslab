// FARS accident files -> daily fatal crash counts by state, 14 days either side of two spring
// Sundays each year: the first Sunday of April (the change date 1987-2006) and the second Sunday
// of March (the change date from 2007). Each crash is joined to its state's clock rule for that
// day (IANA extract) and to the sun's elevation at its place and minute (computed).
//
// Usage: node pipelines/dst-crashes/extract.mjs --cache <folder> [--from 1996] [--to 2024]
// The folder holds FARS<year>.zip, NHTSA's national CSV archives. Missing years are downloaded
// from https://static.nhtsa.gov/nhtsa/downloads/FARS/<year>/National/FARS<year>NationalCSV.zip.
// Writes data/dst-crashes/window.csv and data/dst-crashes/extract.json.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../airport-contract/csv.mjs';
import { loadTzdata, dstStart, resolveOn, observesDst, utcOffsetMinutes, weekday } from './clock.mjs';
import { stateInfo, EXCLUDED } from './states.mjs';
import { solarElevation, sunClass } from './sun.mjs';

export const WINDOW_DAYS = 14;
export const ANCHORS = {
  april1: { month: 4, on: 'Sun>=1', label: 'first Sunday of April' },
  march2: { month: 3, on: 'Sun>=8', label: 'second Sunday of March' },
};
export const FIELDS = ['STATE', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'FATALS', 'LGT_COND', 'DAY_WEEK'];

const OUT = new URL('../../data/dst-crashes/', import.meta.url);

/** Day number since 1970-01-01 for a calendar date. */
export const dayNumber = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000;
const iso = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

/** The two anchor Sundays of a year, and which one the clocks changed on. */
export function anchorsFor(tz, year) {
  const start = dstStart(tz, year);
  return Object.entries(ANCHORS).map(([name, a]) => {
    const d = resolveOn(a.on, year, a.month);
    return { name, y: year, m: a.month, d, day: dayNumber(year, a.month, d), isChange: start.m === a.month && start.d === d };
  });
}

/** FARS light condition code -> day | twilight | dark | unknown. Codes are stable since 1996. */
export function farsLight(code) {
  if (code === 1) return 'day';
  if (code === 4 || code === 5) return 'twilight';
  if (code === 2 || code === 3 || code === 6) return 'dark';
  return 'unknown';
}

/** Coordinates are usable only inside a box around the US; FARS codes unknowns as 77.7777, 88.8888, 99.9999 and so on. */
export function validCoords(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 17 && lat <= 72 && lon >= -180 && lon <= -64;
}

function pick(row, name) {
  if (name in row) return row[name];
  const k = Object.keys(row).find((c) => c.toUpperCase() === name);
  return k === undefined ? undefined : row[k];
}

/**
 * One accident row -> a normalised crash, or { drop: reason }. The year comes from the file,
 * because files before 1998 write it with two digits.
 */
export function normalise(row, year) {
  const n = {};
  for (const f of FIELDS) {
    const v = pick(row, f);
    if (v === undefined) return { drop: `missing column ${f}` };
    n[f] = Number(v);
  }
  const lat = Number(pick(row, 'LATITUDE') ?? NaN);
  const lon = Number(pick(row, 'LONGITUD') ?? NaN);
  const { STATE: state, MONTH: m, DAY: d, HOUR: h, MINUTE: mi } = n;
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= new Date(Date.UTC(year, m, 0)).getUTCDate())) return { drop: 'unknown date' };
  const timeKnown = h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
  return {
    year, state, m, d, day: dayNumber(year, m, d),
    hour: timeKnown ? h : null, minute: timeKnown ? mi : null,
    fatals: n.FATALS, light: farsLight(n.LGT_COND), lgtCode: n.LGT_COND,
    dayWeekOk: n.DAY_WEEK === weekday(year, m, d) + 1,
    lat: validCoords(lat, lon) ? lat : null, lon: validCoords(lat, lon) ? lon : null,
  };
}

/** Sun class at the crash, or null when the time or place is unknown. */
export function sunAtCrash(tz, crash, zone) {
  if (crash.hour === null || crash.lat === null) return null;
  const clock = crash.hour * 60 + crash.minute;
  const offset = utcOffsetMinutes(tz, zone, crash.year, crash.m, crash.d, clock);
  const utc = Date.UTC(crash.year, crash.m - 1, crash.d, crash.hour, crash.minute) - offset * 60000;
  return sunClass(solarElevation(crash.lat, crash.lon, utc));
}

export const COLUMNS = ['year', 'anchor', 'is_change', 'state', 'group', 'offset', 'date', 'weekday', 'crashes', 'deaths',
  'crashes_am', 'crashes_pm', 'crashes_time_unknown', 'crashes_sun_day', 'crashes_sun_twilight', 'crashes_sun_dark'];

/**
 * Aggregate one year's normalised crashes into window cells, and tally the joins.
 * Returns { cells: Map, tally }.
 */
export function aggregateYear(tz, year, crashes) {
  const anchors = anchorsFor(tz, year);
  const cells = new Map();
  const tally = {
    inWindow: 0, excluded: 0, sunJoined: 0, timeUnknown: 0, coordsUnknown: 0,
    agreement: { both: 0, agree: 0, farsDaySunDark: 0, farsDarkSunDay: 0 },
  };
  for (const c of crashes) {
    for (const a of anchors) {
      const offset = c.day - a.day;
      if (offset < -WINDOW_DAYS || offset > WINDOW_DAYS) continue;
      if (EXCLUDED[c.state]) { tally.excluded++; continue; }
      const s = stateInfo(c.state);
      if (!s) { tally.excluded++; continue; }
      tally.inWindow++;
      const group = observesDst(tz, s.zone, year, a.m, a.d) ? 'observing' : 'standard';
      const key = `${a.name}|${c.state}|${offset}`;
      let cell = cells.get(key);
      if (!cell) {
        cell = {
          year, anchor: a.name, is_change: a.isChange ? 1 : 0, state: s.abbr, group, offset,
          date: iso(a.day + offset), weekday: new Date((a.day + offset) * 86400000).getUTCDay(),
          crashes: 0, deaths: 0, crashes_am: 0, crashes_pm: 0, crashes_time_unknown: 0,
          crashes_sun_day: 0, crashes_sun_twilight: 0, crashes_sun_dark: 0,
        };
        cells.set(key, cell);
      }
      cell.crashes++;
      cell.deaths += c.fatals;
      if (c.hour === null) { cell.crashes_time_unknown++; tally.timeUnknown++; } else {
        if (c.hour >= 5 && c.hour <= 9) cell.crashes_am++;
        if (c.hour >= 16 && c.hour <= 20) cell.crashes_pm++;
      }
      if (c.lat === null) tally.coordsUnknown++;
      const sun = sunAtCrash(tz, c, s.zone);
      if (sun) {
        tally.sunJoined++;
        cell[`crashes_sun_${sun}`]++;
        if ((sun === 'day' || sun === 'dark') && (c.light === 'day' || c.light === 'dark')) {
          tally.agreement.both++;
          if (sun === c.light) tally.agreement.agree++;
          else if (c.light === 'day') tally.agreement.farsDaySunDark++;
          else tally.agreement.farsDarkSunDay++;
        }
      }
    }
  }
  return { cells, tally, anchors };
}

/** Read the accident table out of a FARS zip. Its name and case vary by year. */
export function readAccidentCsv(zipPath) {
  const members = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n');
  const member = members.find((m) => /(^|\/)accident\.csv$/i.test(m.trim()));
  if (!member) throw new Error(`${zipPath}: no accident.csv inside`);
  const buf = execFileSync('unzip', ['-p', zipPath, member.trim()], { maxBuffer: 1 << 30 });
  return { member: member.trim(), ...decodeAccident(buf) };
}

/** 2021 and 2022 start with a UTF-8 byte-order mark; read as Latin-1 it would rename STATE. */
export function decodeAccident(buf) {
  const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  return { bom, text: (bom ? buf.subarray(3) : buf).toString('latin1') };
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function toCsv(cells) {
  const lines = [COLUMNS.join(',')];
  for (const c of cells) lines.push(COLUMNS.map((k) => c[k]).join(','));
  return lines.join('\n') + '\n';
}

function args(argv) {
  const o = { from: 1996, to: 2024, cache: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cache') o.cache = argv[++i];
    else if (argv[i] === '--from') o.from = Number(argv[++i]);
    else if (argv[i] === '--to') o.to = Number(argv[++i]);
  }
  if (!o.cache) throw new Error('Pass --cache <folder> holding (or receiving) FARS<year>.zip files');
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  mkdirSync(o.cache, { recursive: true });
  const tz = loadTzdata();
  const all = [];
  const years = [];
  for (let y = o.from; y <= o.to; y++) {
    const zip = join(o.cache, `FARS${y}.zip`);
    const url = `https://static.nhtsa.gov/nhtsa/downloads/FARS/${y}/National/FARS${y}NationalCSV.zip`;
    if (!existsSync(zip)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
    }
    const { member, bom, text } = readAccidentCsv(zip);
    const { columns, rows } = parseCsv(text);
    const drops = {};
    const crashes = [];
    let dayWeekMismatch = 0;
    const lgtCodes = {};
    for (const r of rows) {
      const c = normalise(r, y);
      if (c.drop) { drops[c.drop] = (drops[c.drop] ?? 0) + 1; continue; }
      if (!c.dayWeekOk) dayWeekMismatch++;
      lgtCodes[c.lgtCode] = (lgtCodes[c.lgtCode] ?? 0) + 1;
      crashes.push(c);
    }
    const { cells, tally, anchors } = aggregateYear(tz, y, crashes);
    all.push(...cells.values());
    years.push({
      year: y, url, sha256: sha256(zip), member, byteOrderMark: bom, columns: columns.length,
      hasCoordinates: columns.some((c) => c.toUpperCase() === 'LATITUDE'),
      rows: rows.length, crashes: crashes.length, deaths: crashes.reduce((n, c) => n + c.fatals, 0),
      dropped: drops, dayWeekMismatch, lightCodes: lgtCodes,
      change: anchors.find((a) => a.isChange).name, ...tally,
    });
    console.log(`${y}: ${rows.length} crashes, ${tally.inWindow} in windows, sun joined ${tally.sunJoined}`);
  }
  all.sort((a, b) => a.year - b.year || a.anchor.localeCompare(b.anchor) || a.state.localeCompare(b.state) || a.offset - b.offset);
  writeFileSync(new URL('window.csv', OUT), toCsv(all));
  writeFileSync(new URL('extract.json', OUT), JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    tzdata: '2026f',
    windowDays: WINDOW_DAYS,
    excluded: EXCLUDED,
    years,
  }, null, 1) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
