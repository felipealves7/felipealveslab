// The calendar every comparison in this lab uses: one row per day with its weekday, Brazil's
// national holidays, Carnival and the Easter days, and the two weekday-aligned reference days.
//
// A day in 2020 is compared with the day 364 days earlier (2019) and 728 days earlier (2018): both
// fall on the same weekday. A comparison is kept only if none of the three days is a holiday, a
// bridge day or a Carnival or Easter day, so a Tuesday of Carnival is never set against an
// ordinary Tuesday.

/** Day number since 1970-01-01. */
export const dayNumber = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
export const isoDay = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
export const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday

/** Easter Sunday (Gregorian), by the anonymous computus. */
export function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Brazil's national public holidays fixed by date, plus Christmas Eve and New Year's Eve, when
// load also departs from an ordinary weekday. State and city holidays are not included.
const FIXED = {
  '01-01': 'New Year',
  '04-21': 'Tiradentes',
  '05-01': 'Labour Day',
  '09-07': 'Independence Day',
  '10-12': 'Our Lady of Aparecida',
  '11-02': 'All Souls',
  '11-15': 'Republic Day',
  '12-24': 'Christmas Eve',
  '12-25': 'Christmas',
  '12-31': "New Year's Eve",
};
// Days set by Easter: the Carnival Monday and Tuesday and Ash Wednesday, the Easter weekend from
// Good Friday to Easter Sunday, and Corpus Christi.
const MOVABLE = [
  [-48, 'Carnival Monday'],
  [-47, 'Carnival Tuesday'],
  [-46, 'Ash Wednesday'],
  [-2, 'Good Friday'],
  [-1, 'Holy Saturday'],
  [0, 'Easter Sunday'],
  [60, 'Corpus Christi'],
];

/**
 * Every holiday-type day of a year, as a map of ISO date to name. A Monday before a Tuesday
 * holiday and a Friday after a Thursday holiday are bridge days, which many take off.
 */
export function holidays(year) {
  const out = new Map();
  for (const [md, name] of Object.entries(FIXED)) out.set(`${year}-${md}`, name);
  const e = dayNumber(easter(year));
  for (const [offset, name] of MOVABLE) out.set(isoDay(e + offset), name);
  for (const [date, name] of [...out]) {
    const wd = weekday(date);
    const n = dayNumber(date);
    const bridge = wd === 2 ? isoDay(n - 1) : wd === 4 ? isoDay(n + 1) : null;
    if (bridge && !out.has(bridge)) out.set(bridge, `Bridge day (${name})`);
  }
  return out;
}

const cache = new Map();
/** The holiday name of a day, or null. */
export function holidayOf(iso) {
  const y = +iso.slice(0, 4);
  if (!cache.has(y)) cache.set(y, holidays(y));
  return cache.get(y).get(iso) ?? null;
}

/** The two weekday-aligned reference days of a day: 364 and 728 days earlier. */
export function referenceDays(iso) {
  const n = dayNumber(iso);
  return [isoDay(n - 364), isoDay(n - 728)];
}

/** True if the day and both its reference days are ordinary days (no holiday, Carnival or Easter day). */
export function comparable(iso) {
  return [iso, ...referenceDays(iso)].every((d) => holidayOf(d) === null);
}

/** Calendar rows from `from` to `to`, inclusive. */
export function calendar(from, to) {
  const rows = [];
  for (let n = dayNumber(from); n <= dayNumber(to); n += 1) {
    const date = isoDay(n);
    const [ref2019, ref2018] = referenceDays(date);
    rows.push({
      date,
      weekday: weekday(date),
      month: date.slice(0, 7),
      quarter: `${date.slice(0, 4)}-Q${Math.floor((+date.slice(5, 7) - 1) / 3) + 1}`,
      week: isoWeek(date),
      holiday: holidayOf(date),
      ref_a: ref2019,
      ref_b: ref2018,
      comparable: comparable(date),
    });
  }
  return rows;
}

/** ISO 8601 week, as YYYY-Www. */
export function isoWeek(iso) {
  const n = dayNumber(iso);
  const wd = (weekday(iso) + 6) % 7; // Monday = 0
  const thursday = n - wd + 3;
  const year = +isoDay(thursday).slice(0, 4);
  const firstThursday = dayNumber(`${year}-01-04`) - ((weekday(`${year}-01-04`) + 6) % 7) + 3;
  const w = 1 + Math.round((thursday - firstThursday) / 7);
  return `${year}-W${String(w).padStart(2, '0')}`;
}

/** The Monday that starts a day's ISO week. */
export const weekStart = (iso) => isoDay(dayNumber(iso) - ((weekday(iso) + 6) % 7));
