// The pipeline walkthrough on /lab/aviation-reliability. Each cell is a line range from a file in
// data/aviation-reliability/code/, which are byte-for-byte copies of the code that ran (checked against
// the package's source-code-checksums.json in scripts/aviation-page.test.mjs). The copies cannot carry
// region markers without changing their checksums, so each range names a line it must contain: if a
// file changes, the build stops instead of showing the wrong lines.

export const STAGES = [
  {
    no: '01',
    title: 'Download the official archives',
    description: 'One ZIP per month from the BTS archive. A file already on disk is reused only if its SHA-256 still matches. Busy-server errors are retried twice, then the run stops. Each archive must hold exactly one CSV.',
    cells: [
      { file: 'download.py', from: 9, to: 24, anchor: 'def fetch(ym):' },
      { file: 'download.py', from: 26, to: 29, anchor: 'z.testzip()' },
    ],
  },
  {
    no: '02',
    title: 'Keep every row, count them a second way',
    description: 'Each archive is read in chunks into Parquet, with every row kept. The same pass counts flights, cancellations and on-time arrivals straight from the original CSV. Those counts are the yardstick for step 05.',
    cells: [
      { file: 'ingest.py', from: 11, to: 19, anchor: 'def totals(f):' },
      { file: 'ingest.py', from: 27, to: 31, anchor: 'Wrong archive period' },
    ],
  },
  {
    no: '03',
    title: 'Give each flight one outcome',
    description: 'A flight counts as arrived only if it was neither cancelled nor diverted and has an arrival delay. On time means less than 15 minutes late. A departure scheduled at 2400 goes in the midnight band.',
    cells: [
      { file: 'fct_flights.sql', from: 2, to: 4, anchor: 'as observed' },
      { file: 'fct_flights.sql', from: 12, to: 17, anchor: 'arrival_delay_minutes<15' },
      { file: 'stg_flights.sql', from: 13, to: 14, anchor: 'CRSDepTime=2400' },
    ],
  },
  {
    no: '04',
    title: 'Add up first, divide last',
    description: 'The monthly table holds only counts and minute totals. Every rate on this page is a sum divided by a sum, never an average of other rates.',
    cells: [{ file: 'mart_month.sql', from: 1, to: 7, anchor: 'group by 1,2,3' }],
  },
  {
    no: '05',
    title: 'Test, then reconcile',
    description: 'Two of the dbt tests: every flight has exactly one outcome, and the route table adds up to the monthly table. Then the monthly table is compared with the counts from step 02.',
    cells: [
      { file: 'status_partition.sql', from: 1, to: 3, anchor: 'scheduled<>cancelled+diverted' },
      { file: 'mart_reconciliation.sql', from: 1, to: 7, anchor: 'full join' },
    ],
  },
];

export function excerpt(source, cell) {
  const lines = String(source).split(/\r?\n/);
  if (cell.from < 1 || cell.to < cell.from || cell.to > lines.length) {
    throw new Error(`Lines ${cell.from}-${cell.to} are outside ${cell.file}`);
  }
  const code = lines.slice(cell.from - 1, cell.to).join('\n');
  if (!code.includes(cell.anchor)) {
    throw new Error(`${cell.file} lines ${cell.from}-${cell.to} no longer contain "${cell.anchor}"`);
  }
  return {
    file: cell.file,
    code,
    lines: `L${cell.from}–L${cell.to}`,
    url: `https://github.com/felipealves7/felipealveslab/blob/main/data/aviation-reliability/code/${cell.file}#L${cell.from}-L${cell.to}`,
  };
}

// The download step's own record: how many archives, which months, how many bytes.
export function sourceSummary(manifest) {
  if (!Array.isArray(manifest) || !manifest.length) throw new Error('Empty source manifest');
  const periods = manifest.map((m) => m.period).sort();
  const bytes = manifest.reduce((n, m) => n + m.bytes, 0);
  if (!manifest.every((m) => m.zip_integrity === 'pass' && /^[0-9a-f]{64}$/.test(m.sha256))) {
    throw new Error('A source archive lacks a passed integrity check or a SHA-256');
  }
  return { archives: manifest.length, first: periods[0], last: periods[periods.length - 1], megabytes: Math.round(bytes / 1e6) };
}
