// Rehearsed breaks for the Lab page's "Break today's data" panel. Each break takes the parsed tables
// and returns a broken copy; the originals are never changed. Rows are picked at even spacing, not
// at random, so the same break gives the same result every time. Pure, shared by tests and browser.

const DAY = 86400000;

// count positions spread evenly through n rows, never the first row (some breaks copy from the row before).
export function spaced(n, count) {
  if (n < 2) return [];
  const take = Math.min(count, n - 1);
  const step = (n - 1) / take;
  return Array.from({ length: take }, (_, k) => 1 + Math.floor(k * step));
}

const replaceTable = (tables, name, table) => ({ ...tables, [name]: table });

function editRows(tables, name, positions, edit) {
  const original = tables[name].rows;
  const rows = original.slice();
  for (const i of positions) rows[i] = edit({ ...original[i] }, original, i);
  return replaceTable(tables, name, { columns: tables[name].columns, rows });
}

export function renameColumn(tables, name, from, to) {
  const t = tables[name];
  const rename = (k) => (k === from ? to : k);
  return replaceTable(tables, name, {
    columns: t.columns.map(rename),
    rows: t.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [rename(k), v]))),
  });
}

export const FAULTS = [
  {
    id: 'rename-country',
    label: 'Rename the column iso_country to country_code in the airports file',
    apply: (s) => ({ ...s, tables: renameColumn(s.tables, 'airports', 'iso_country', 'country_code') }),
  },
  {
    id: 'duplicate-ids',
    label: 'Give 50 airports the id of the airport listed before them',
    apply: (s) => ({ ...s, tables: editRows(s.tables, 'airports', spaced(s.tables.airports.rows.length, 50), (r, rows, i) => ({ ...r, id: rows[i - 1].id })) }),
  },
  {
    id: 'north-pole',
    label: 'Move 200 airports north of the North Pole (latitude 91.5)',
    apply: (s) => ({ ...s, tables: editRows(s.tables, 'airports', spaced(s.tables.airports.rows.length, 200), (r) => ({ ...r, latitude_deg: '91.5' })) }),
  },
  {
    id: 'orphan-runways',
    label: 'Point 100 runways at an airport id that does not exist',
    apply: (s) => ({ ...s, tables: editRows(s.tables, 'runways', spaced(s.tables.runways.rows.length, 100), (r) => ({ ...r, airport_ref: '-1' })) }),
  },
  {
    id: 'lose-airports',
    label: 'Cut off the last 40% of the airports file',
    apply: (s) => {
      const t = s.tables.airports;
      return { ...s, tables: replaceTable(s.tables, 'airports', { columns: t.columns, rows: t.rows.slice(0, Math.ceil(t.rows.length * 0.6)) }) };
    },
  },
  {
    id: 'lowercase-countries',
    label: 'Write the country codes in lower case in the countries file',
    apply: (s) => ({ ...s, tables: editRows(s.tables, 'countries', s.tables.countries.rows.map((_, i) => i), (r) => ({ ...r, code: String(r.code).toLowerCase() })) }),
  },
  {
    id: 'stale-file',
    label: 'Serve files that last changed 30 days before the run',
    apply: (s) => ({ ...s, lastModified: new Date(Date.parse(s.runDate) - 30 * DAY).toISOString() }),
  },
];

// state: { tables, lastModified, runDate }. Applies the chosen breaks in the order of FAULTS.
export function applyFaults(state, ids) {
  const chosen = new Set(ids);
  return FAULTS.filter((f) => chosen.has(f.id)).reduce((s, f) => f.apply(s), state);
}
