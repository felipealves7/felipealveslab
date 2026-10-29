// Download and parse the three OurAirports files. The weekly runner (Node) and the Lab page's
// "Run it on today's files" button (browser) both call fetchTables, so they run the same code.
// No Node-only imports here.
import { parseCsv } from './csv.mjs';

// #region source
export const BASE_URL = 'https://davidmegginson.github.io/ourairports-data/';
export const TABLES = ['airports', 'runways', 'countries'];
// #endregion

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Fetch and parse each table in turn. Returns the parsed tables, the oldest Last-Modified date
// across the files (ISO, or undefined when no file sent one) and one record per file.
// onProgress({ table, phase, file }) is awaited before each download, before each parse and after
// each file, so a page can repaint between the slow steps.
export async function fetchTables({ fetchImpl = globalThis.fetch, baseUrl = BASE_URL, onProgress } = {}) {
  const tables = {};
  const files = [];
  for (const table of TABLES) {
    if (onProgress) await onProgress({ table, phase: 'download' });
    const started = clock();
    // #region request
    const res = await fetchImpl(`${baseUrl}${table}.csv`);
    if (!res.ok) throw new Error(`${table}.csv returned HTTP ${res.status}`);
    const modified = res.headers.get('last-modified'); // freshness is read from this header
    const body = new Uint8Array(await res.arrayBuffer());
    // #endregion
    const fetched = clock();
    if (onProgress) await onProgress({ table, phase: 'parse' });
    const parseStarted = clock();
    // #region parse
    tables[table] = parseCsv(new TextDecoder('utf-8').decode(body));
    // #endregion
    const file = {
      table,
      httpStatus: res.status,
      lastModified: modified ? new Date(modified).toISOString() : null,
      bytes: body.byteLength,
      rows: tables[table].rows.length,
      columns: tables[table].columns.length,
      fetchMs: Math.round(fetched - started),
      parseMs: Math.round(clock() - parseStarted),
    };
    files.push(file);
    if (onProgress) await onProgress({ table, phase: 'done', file });
  }
  return { tables, lastModified: oldest(files.map((f) => f.lastModified)), files };
}

// A run is only as fresh as its stalest file, so the oldest Last-Modified date counts.
export function oldest(dates) {
  return dates.filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
}
