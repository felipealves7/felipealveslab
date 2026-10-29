// Rebuilds everything derived from the seed: SQL files for D1, the scorecard and the recorded session.
// Usage: node pipelines/ledger-api/build.mjs
// Generated queries (model output) go in data/ledger-api/generated.json as {"1": "SELECT ...", ...}; none exist yet.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildDataset, seedSql, SCHEMA_SQL, SEED } from './dataset.mjs';
import { openDb, buildScorecard, run } from './score.mjs';
import { QUESTIONS, RECORDED } from './questions.mjs';

export function buildOutputs(generated = {}) {
  const data = buildDataset();
  const db = openDb(data);
  const scorecard = { ...buildScorecard(db, generated), synthetic: true, seed: SEED, model: Object.keys(generated).length ? 'see README' : null };
  const recorded = {
    note: 'Illustrative session. These are the hand-written reference queries from the scorecard, run on the synthetic ledger. This is not output from the live model.',
    synthetic: true,
    turns: RECORDED.map((r) => {
      const q = QUESTIONS.find((x) => x.id === r.ref);
      const rows = run(db, q.sql);
      return { question: r.question, sql: q.sql, columns: rows[0] ? Object.keys(rows[0]) : [], rows, explanation: r.explanation };
    }),
  };
  return { schema: SCHEMA_SQL, seed: seedSql(data), scorecard, recorded };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const genPath = 'data/ledger-api/generated.json';
  const generated = existsSync(genPath) ? JSON.parse(readFileSync(genPath, 'utf8')) : {};
  const out = buildOutputs(generated);
  mkdirSync('worker/ledger-api/sql', { recursive: true });
  writeFileSync('worker/ledger-api/sql/schema.sql', out.schema);
  writeFileSync('worker/ledger-api/sql/seed.sql', out.seed);
  for (const dir of ['data/ledger-api', 'public/data/ledger-api']) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/scorecard.json`, JSON.stringify(out.scorecard, null, 2) + '\n');
    writeFileSync(`${dir}/recorded.json`, JSON.stringify(out.recorded, null, 2) + '\n');
  }
  console.log(`Wrote SQL, scorecard (${out.scorecard.ran} of ${out.scorecard.total} questions scored) and recorded session.`);
}
