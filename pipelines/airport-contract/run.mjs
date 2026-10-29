// Weekly run: download three OurAirports CSVs, check them against the contract, append one run record.
//   node pipelines/airport-contract/run.mjs                       real run (needs network)
//   node pipelines/airport-contract/run.mjs --dir <folder>        read airports.csv, runways.csv, countries.csv from a folder
//   node pipelines/airport-contract/run.mjs --rename airports.iso_country=country_code --note "text"
//                                                                 rename a column first, to rehearse an upstream break
// Cached output: data/airport-contract/results.json (copied to public/ for the page).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './csv.mjs';
import { runContract, freshness, MAX_AGE_DAYS } from './contract.mjs';

export const BASE_URL = 'https://davidmegginson.github.io/ourairports-data/';
export const TABLES = ['airports', 'runways', 'countries'];
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUTPUTS = [join(root, 'data/airport-contract/results.json'), join(root, 'public/data/airport-contract/results.json')];
const KEEP_RUNS = 52;

export function applyRename(tables, spec) {
  const [target, to] = spec.split('=');
  const [table, from] = target.split('.');
  const t = tables[table];
  t.columns = t.columns.map((c) => (c === from ? to : c));
  t.rows = t.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k === from ? to : k, v])));
}

export function makeRun({ tables, lastModified, runDate, deliberate = false, note = '' }) {
  const contract = runContract(tables);
  const fresh = freshness(lastModified, runDate);
  const rejected = {};
  for (const c of contract.checks) if (c.level === 'row') rejected[c.table] = Math.max(rejected[c.table] ?? 0, c.failed);
  return {
    runDate,
    status: contract.status === 'pass' && fresh.ok ? 'pass' : 'fail',
    deliberate,
    note,
    freshness: fresh,
    rows: Object.fromEntries(TABLES.map((t) => [t, tables[t].rows.length])),
    columns: Object.fromEntries(TABLES.map((t) => [t, tables[t].columns.length])),
    checks: contract.checks,
  };
}

async function load(dir) {
  const tables = {};
  let lastModified;
  for (const t of TABLES) {
    if (dir) tables[t] = parseCsv(readFileSync(join(dir, `${t}.csv`), 'utf8'));
    else {
      const res = await fetch(`${BASE_URL}${t}.csv`);
      if (!res.ok) throw new Error(`${t}.csv returned HTTP ${res.status}`);
      const lm = res.headers.get('last-modified');
      if (lm && (!lastModified || Date.parse(lm) < Date.parse(lastModified))) lastModified = lm;
      tables[t] = parseCsv(await res.text());
    }
  }
  return { tables, lastModified };
}

async function main(argv) {
  const opt = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };
  const dir = opt('--dir');
  const { tables, lastModified: lm } = await load(dir);
  const lastModified = lm ? new Date(lm).toISOString() : new Date(opt('--last-modified') ?? Date.now()).toISOString();
  const rename = opt('--rename');
  if (rename) applyRename(tables, rename);
  const runDate = new Date(opt('--run-date') ?? Date.now()).toISOString();
  const run = makeRun({ tables, lastModified, runDate, deliberate: Boolean(rename), note: opt('--note') ?? '' });
  const prior = existsSync(OUTPUTS[0]) ? JSON.parse(readFileSync(OUTPUTS[0], 'utf8')).runs : [];
  const out = {
    source: 'OurAirports open data, https://ourairports.com/data/ (files served from ' + BASE_URL + ')',
    licence: 'Public Domain, per https://ourairports.com/data/ ("no guarantee of accuracy"). Repository LICENSE: Unlicense.',
    synthetic: false,
    maxAgeDays: MAX_AGE_DAYS,
    runs: [...prior, run].slice(-KEEP_RUNS),
  };
  for (const f of OUTPUTS) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(out, null, 1) + '\n'); }
  const failed = run.checks.filter((c) => !c.passed);
  console.log(`${run.status.toUpperCase()}: ${run.runDate.slice(0, 10)}, ${failed.length} of ${run.checks.length} checks failed, upstream age ${run.freshness.ageDays} days`);
  for (const c of failed) console.log(`  ${c.id}: ${c.failed} failed. ${c.samples.join('; ')}`);
  process.exitCode = run.status === 'pass' ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
