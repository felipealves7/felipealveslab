// Runs the PLD contract on the files in data/ccee-pld-horario/ and appends one run to
// data/ccee-pld/results.json (copied to public/data/ccee-pld/results.json for the page).
//
//   node pipelines/ccee-pld/run.mjs --retrieved 2026-11-14
//       checks the files, records the snapshot (file hashes and month fingerprints), compares it with
//       the previous snapshot and refreshes the page figures when the run passes.
//   node pipelines/ccee-pld/run.mjs --retrieved 2026-11-14 --rename pld_horario_2026.csv:PLD_HORA=PLD
//       rehearsal: renames a column in memory only and records a failed run. Files are not changed.
//   --previous <dir>   also compare hour by hour with an older download kept in <dir>.
//   --dry-run          print the result, write nothing.
//
// No network: CCEE refuses automated downloads from cloud servers, so a refresh is a manual download
// into data/ccee-pld-horario/ (see its README). Exit codes: 0 passed, 1 failed and recorded, 2 error.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePldFile } from './load.mjs';
import { runContract, describeContract } from './contract.mjs';
import { monthDigests, compareDigests, compareRows } from './snapshot.mjs';
import { summarise } from './summary.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAX_LISTED_CHANGES = 200;

export function readFolder(dir) {
  return readdirSync(dir).filter((n) => /^pld_horario_\d{4}\.csv$/.test(n)).sort().map((name) => {
    const bytes = readFileSync(join(dir, name));
    const parsed = parsePldFile(bytes.toString('utf8'));
    return { name, year: Number(name.match(/\d{4}/)[0]), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, ...parsed };
  });
}

/** Rename a column in memory: "file.csv:OLD=NEW". Returns new file objects; the originals are untouched. */
export function renameColumn(files, spec) {
  const m = /^([^:]+):([^=]+)=(.+)$/.exec(spec);
  if (!m) throw new Error(`--rename wants file.csv:OLD=NEW, got ${spec}`);
  const [, file, from, to] = m;
  if (!files.some((f) => f.name === file && f.columns.includes(from))) throw new Error(`${file} has no column ${from}`);
  return files.map((f) => (f.name !== file ? f : {
    ...f,
    columns: f.columns.map((c) => (c === from ? to : c)),
    rows: f.rows.map((r) => { const o = { ...r, [to]: r[from] }; delete o[from]; return o; }),
  }));
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

export function emptyResults() {
  return {
    source: {
      name: 'CCEE open data, PLD_HORARIO',
      url: 'https://dadosabertos.ccee.org.br/dataset/pld_horario',
      licence: 'CC BY 4.0, https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Câmara de Comercialização de Energia Elétrica (CCEE)',
      unit: 'R$/MWh (unit not stated on the dataset page)',
    },
    contract: describeContract(),
    snapshots: [],
    comparisons: [],
    runs: [],
    summary: null,
  };
}

/** Pure core of a run, so tests can drive it without touching disk. */
export function recordRun(results, files, { retrieved, rename, runDate, previousFiles }) {
  const checked = rename ? renameColumn(files, rename) : files;
  const contract = runContract(checked, retrieved);
  const run = {
    runDate, kind: rename ? 'rehearsal' : 'real', retrieved, status: contract.status,
    ...(rename ? { change: `renamed ${rename.replace(':', ' column ').replace('=', ' to ')} in memory` } : {}),
    files: checked.map((f) => ({ name: f.name, rows: f.rows.length, sha256: f.sha256, shape: f.shape })),
    checks: contract.checks, causes: contract.causes,
  };
  results.runs.push(run);
  if (rename) return run;

  // A real run records the download as a snapshot, unless it is byte-for-byte the last one.
  const hashes = files.map((f) => `${f.name}:${f.sha256}`).join(',');
  const last = results.snapshots.at(-1);
  if (!last || last.files.map((f) => `${f.name}:${f.sha256}`).join(',') !== hashes) {
    const snap = { retrieved, files: files.map((f) => ({ name: f.name, rows: f.rows.length, bytes: f.bytes, sha256: f.sha256 })), months: monthDigests(files) };
    if (last) {
      const cmp = { from: last.retrieved, to: retrieved, months: compareDigests(last.months, snap.months) };
      if (previousFiles) {
        const rows = compareRows(previousFiles, files);
        cmp.rows = { changedCount: rows.changed.length, changed: rows.changed.slice(0, MAX_LISTED_CHANGES), removed: rows.removed.slice(0, MAX_LISTED_CHANGES), removedCount: rows.removed.length, added: rows.added };
      }
      results.comparisons.push(cmp);
    }
    results.snapshots.push(snap);
  } else run.sameAsSnapshot = last.retrieved;
  if (contract.status === 'passed') results.summary = { retrieved, ...summarise(files) };
  return run;
}

async function main() {
  const a = args(process.argv.slice(2));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.retrieved ?? '')) throw new Error('--retrieved YYYY-MM-DD is required: the day the files were downloaded');
  const dataDir = join(ROOT, a.data ?? 'data/ccee-pld-horario');
  const outFile = join(ROOT, 'data/ccee-pld/results.json');
  const pubFile = join(ROOT, 'public/data/ccee-pld/results.json');
  const results = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : emptyResults();
  results.contract = describeContract();
  const files = readFolder(dataDir);
  if (!files.length) throw new Error(`no pld_horario_YYYY.csv files in ${dataDir}`);
  const previousFiles = a.previous ? readFolder(join(ROOT, a.previous)) : undefined;
  const run = recordRun(results, files, { retrieved: a.retrieved, rename: a.rename, runDate: a['run-date'] ?? new Date().toISOString().slice(0, 10), previousFiles });

  console.log(`${run.kind} run, files retrieved ${run.retrieved}: ${run.status}`);
  for (const k of run.checks) console.log(`  ${k.status.padEnd(7)} ${k.id}  ${k.bad} of ${k.total} bad${k.blockedBy ? ` (needs ${k.blockedBy.join(', ')})` : ''}${k.examples.length ? `  e.g. ${k.examples.join('; ')}` : ''}`);
  for (const c of run.causes) console.log(`  cause: ${c.cause} -> ${c.checks.join(', ')}`);
  if (run.sameAsSnapshot) console.log(`  same files as the snapshot of ${run.sameAsSnapshot}: no new snapshot`);
  const cmp = results.comparisons.at(-1);
  if (cmp && cmp.to === run.retrieved && !run.sameAsSnapshot) console.log(`  compared with ${cmp.from}: ${cmp.months.changed.length} months rewritten, ${cmp.months.added.length} added, ${cmp.months.removed.length} gone`);

  if (!a.dryRun) {
    const text = `${JSON.stringify(results, null, 1)}\n`;
    mkdirSync(dirname(outFile), { recursive: true });
    mkdirSync(dirname(pubFile), { recursive: true });
    writeFileSync(outFile, text);
    writeFileSync(pubFile, text);
  }
  return run.status === 'passed' ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(2); });
}
