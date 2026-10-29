// Weekly run: download three OurAirports CSVs, check them against the contract, append one run record.
//   node pipelines/airport-contract/run.mjs                       real run (needs network)
//   node pipelines/airport-contract/run.mjs --dir <folder>        read airports.csv, runways.csv, countries.csv from a folder
//   node pipelines/airport-contract/run.mjs --rename airports.iso_country=country_code --note "text"
//                                                                 rename a column first, to rehearse an upstream break
// Cached output: data/airport-contract/results.json (copied to public/ for the page).
// The download and the run record live in load.mjs and record.mjs, which the Lab page runs too.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './csv.mjs';
import { MAX_AGE_DAYS } from './contract.mjs';
import { BASE_URL, TABLES, fetchTables } from './load.mjs';
import { applyRename, makeRun } from './record.mjs';

export { BASE_URL, TABLES, applyRename, makeRun };

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUTPUTS = [join(root, 'data/airport-contract/results.json'), join(root, 'public/data/airport-contract/results.json')];
const KEEP_RUNS = 52;

async function load(dir) {
  if (!dir) return fetchTables();
  const tables = {};
  for (const t of TABLES) tables[t] = parseCsv(readFileSync(join(dir, `${t}.csv`), 'utf8'));
  return { tables, lastModified: undefined, files: undefined };
}

async function main(argv) {
  const opt = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };
  const dir = opt('--dir');
  const { tables, lastModified: lm, files } = await load(dir);
  const lastModified = lm ?? new Date(opt('--last-modified') ?? Date.now()).toISOString();
  const rename = opt('--rename');
  if (rename) applyRename(tables, rename);
  const runDate = new Date(opt('--run-date') ?? Date.now()).toISOString();
  const run = makeRun({ tables, lastModified, runDate, deliberate: Boolean(rename), note: opt('--note') ?? '', files });
  const prior = existsSync(OUTPUTS[0]) ? JSON.parse(readFileSync(OUTPUTS[0], 'utf8')).runs : [];
  const out = {
    source: 'OurAirports open data, https://ourairports.com/data/ (files served from ' + BASE_URL + ')',
    licence: 'Public Domain, per https://ourairports.com/data/ ("no guarantee of accuracy"). Repository LICENSE: Unlicense.',
    synthetic: false,
    maxAgeDays: MAX_AGE_DAYS,
    // #region record
    // Every run is kept, passed or failed, newest last. Only the latest 52 stay: a year of weekly runs.
    runs: [...prior, run].slice(-KEEP_RUNS),
    // #endregion
  };
  for (const f of OUTPUTS) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(out, null, 1) + '\n'); }
  const failed = run.checks.filter((c) => !c.passed);
  console.log(`${run.status.toUpperCase()}: ${run.runDate.slice(0, 10)}, ${failed.length} of ${run.checks.length} checks failed, upstream age ${run.freshness.ageDays} days`);
  for (const c of failed) console.log(`  ${c.id}: ${c.failed} failed. ${c.samples.join('; ')}`);
  // #region exit
  // A failed run exits with code 1, so whatever schedules it shows the job as failed.
  process.exitCode = run.status === 'pass' ? 0 : 1;
  // #endregion
}

// Exit codes: 0 the run passed, 1 the run failed and was recorded, 2 nothing was recorded (for
// example a download failed). The weekly job saves the run for 0 and 1 only.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (e) {
    console.error(`ERROR, no run recorded: ${e && e.message ? e.message : e}`);
    process.exitCode = 2;
  }
}
