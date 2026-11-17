// Clock rules from the IANA Time Zone Database extract in data/dst-crashes/tzdata-us.txt.
// Parses the "Rule US" lines and the Zone lines, then answers two questions for a date:
// when did daylight saving time start that year, and does a zone observe it? Zero dependencies.
import { readFileSync } from 'node:fs';

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const TZDATA_PATH = new URL('../../data/dst-crashes/tzdata-us.txt', import.meta.url);

/** Day of the week of a calendar date, 0 = Sunday (UTC arithmetic, no time zone involved). */
export function weekday(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Resolve a tz "ON" field (lastSun, Sun>=8, 14) to a day of the month. */
export function resolveOn(on, y, m) {
  if (/^\d+$/.test(on)) return Number(on);
  let mt = /^last(\w{3})$/.exec(on);
  if (mt) {
    const want = DAYS[mt[1]];
    for (let d = daysInMonth(y, m); d > 0; d--) if (weekday(y, m, d) === want) return d;
  }
  mt = /^(\w{3})>=(\d+)$/.exec(on);
  if (mt) {
    const want = DAYS[mt[1]];
    for (let d = Number(mt[2]); d <= daysInMonth(y, m); d++) if (weekday(y, m, d) === want) return d;
  }
  throw new Error(`Unsupported tz ON field "${on}"`);
}

function hm(s) {
  const neg = s.startsWith('-');
  const [h, m = '0'] = s.replace(/^[-+]/, '').split(':');
  const v = Number(h) * 60 + Number(m);
  return neg ? -v : v;
}

/** Parse the extract into { rules: [...], zones: { name: [lines] } }. */
export function parseTzdata(text) {
  const rules = [];
  const zones = {};
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '');
    if (!line.trim()) continue;
    const f = line.trim().split(/\s+/);
    if (f[0] === 'Rule') {
      current = null;
      const [, name, from, to, , inMonth, on, at, save] = f;
      rules.push({
        name,
        from: Number(from),
        to: to === 'only' ? Number(from) : to === 'max' ? Infinity : Number(to),
        month: MONTHS[inMonth],
        on,
        at,
        saveMinutes: hm(save),
      });
    } else if (f[0] === 'Zone') {
      current = f[1];
      zones[current] = [zoneLine(f.slice(2))];
    } else if (current && /^\s/.test(raw)) {
      zones[current].push(zoneLine(f));
    }
  }
  return { rules, zones };
}

function zoneLine(f) {
  const [stdoff, rule, format, ...until] = f;
  let untilKey = Infinity;
  if (until.length) {
    const y = Number(until[0]);
    const m = until[1] ? MONTHS[until[1]] : 1;
    const d = until[2] ? (/^\d+$/.test(until[2]) ? Number(until[2]) : resolveOn(until[2], y, m)) : 1;
    untilKey = y * 10000 + m * 100 + d;
  }
  return { stdoffMinutes: hm(stdoff), rule, format, untilKey };
}

export function loadTzdata(path = TZDATA_PATH) {
  return parseTzdata(readFileSync(path, 'utf8'));
}

/** The date daylight saving time started in year y under the US rule: { y, m, d, atMinutes }. */
export function dstStart(tz, y) {
  const r = tz.rules.filter((x) => x.name === 'US' && x.saveMinutes > 0 && x.from <= y && y <= x.to);
  if (r.length !== 1) throw new Error(`Expected one US spring rule for ${y}, found ${r.length}`);
  return { y, m: r[0].month, d: resolveOn(r[0].on, y, r[0].month), atMinutes: hm(r[0].at) };
}

/** The date daylight saving time ended in year y under the US rule. */
export function dstEnd(tz, y) {
  const r = tz.rules.filter((x) => x.name === 'US' && x.saveMinutes === 0 && x.from <= y && y <= x.to && x.month >= 9);
  if (r.length !== 1) throw new Error(`Expected one US autumn rule for ${y}, found ${r.length}`);
  return { y, m: r[0].month, d: resolveOn(r[0].on, y, r[0].month), atMinutes: hm(r[0].at) };
}

/** The zone line in force on a date. */
export function zoneLineOn(tz, zone, y, m, d) {
  const lines = tz.zones[zone];
  if (!lines) throw new Error(`Zone ${zone} is not in the extract`);
  const key = y * 10000 + m * 100 + d;
  const line = lines.find((l) => key < l.untilKey);
  if (!line) throw new Error(`No zone line for ${zone} on ${key}`);
  return line;
}

/** Does the zone follow the US daylight saving rule on this date? Throws on any other named rule. */
export function observesDst(tz, zone, y, m, d) {
  const line = zoneLineOn(tz, zone, y, m, d);
  if (line.rule === '-') return false;
  if (line.rule === 'US') return true;
  throw new Error(`Zone ${zone} uses rule ${line.rule} on ${y}-${m}-${d}; only US and "-" are supported`);
}

/**
 * Offset of local clock time from UTC, in minutes, for a clock reading in a zone
 * (for example -300 for EST, -240 for EDT). Readings inside the skipped spring hour are
 * treated as standard time, the hour that did not exist on the clock.
 */
export function utcOffsetMinutes(tz, zone, y, m, d, clockMinutes) {
  const line = zoneLineOn(tz, zone, y, m, d);
  if (!observesDst(tz, zone, y, m, d)) return line.stdoffMinutes;
  const s = dstStart(tz, y);
  const e = dstEnd(tz, y);
  const key = y * 10000 + m * 100 + d;
  const sKey = s.y * 10000 + s.m * 100 + s.d;
  const eKey = e.y * 10000 + e.m * 100 + e.d;
  const after = key > sKey || (key === sKey && clockMinutes >= s.atMinutes + 60);
  const before = key < eKey || (key === eKey && clockMinutes < e.atMinutes);
  return line.stdoffMinutes + (after && before ? 60 : 0);
}
