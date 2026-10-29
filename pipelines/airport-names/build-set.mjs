// Reads the OurAirports airports.csv and keeps the study set: large airports with scheduled service.
// Usage: node pipelines/airport-names/build-set.mjs <path to airports.csv>
// The output is committed, so the page and the tests never need the network.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv } from './csv.mjs';

export const SET_FILE = fileURLToPath(new URL('../../data/airport-names/airports.csv', import.meta.url));
export const COLUMNS = ['id', 'ident', 'iata_code', 'name', 'municipality', 'iso_country', 'continent'];

export function selectSet(rows) {
  return rows
    .filter((r) => r.type === 'large_airport' && r.scheduled_service === 'yes')
    .sort((a, b) => Number(a.id) - Number(b.id));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = selectSet(parseCsv(readFileSync(process.argv[2], 'utf8')));
  writeFileSync(SET_FILE, toCsv(rows, COLUMNS));
  console.log(`${rows.length} airports written to ${SET_FILE}`);
}
