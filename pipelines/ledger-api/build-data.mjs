// Writes the files Felipe pastes into the D1 console, the recorded example session, and the
// "not yet run" scorecard. Run: node pipelines/ledger-api/build-data.mjs
// Never overwrites a scorecard that already holds real model results.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemaFile, seedFile } from './schema.mjs';
import { openLedger, runSql, scoreGenerated, SEED } from './scorecard.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const data = join(root, 'data/ask-the-ledger');
const pub = join(root, 'public/data/ask-the-ledger');

/** Two examples. The SQL is written by hand for illustration: it is NOT model output. Results are computed by running it. */
export const RECORDED = [
  { question: 'Revenue by entity in 2025', sql: "SELECT entity, SUM(amount) AS revenue FROM ledger WHERE grp = 'Revenue' AND month BETWEEN '2025-01' AND '2025-12' GROUP BY entity ORDER BY entity", explanation: 'Adds up every Revenue-group account for each company over calendar 2025. Amounts are in AED thousand.' },
  { question: 'What was the gross margin in 2025?', sql: "SELECT ROUND((SUM(CASE WHEN grp = 'Revenue' THEN amount ELSE 0 END) - SUM(CASE WHEN grp = 'Cost of sales' THEN amount ELSE 0 END)) * 100.0 / SUM(CASE WHEN grp = 'Revenue' THEN amount ELSE 0 END), 1) AS gross_margin_pct FROM ledger WHERE month BETWEEN '2025-01' AND '2025-12'", explanation: 'Gross margin is revenue minus cost of sales, divided by revenue, as a percentage. This covers all six companies together for 2025.' },
];

export function recordedSession() {
  const db = openLedger(SEED);
  return {
    kind: 'recorded example session',
    illustrative: true,
    note: 'The SQL below was written by hand to show the format. It is not model output. The rows are computed by running it on the synthetic ledger.',
    synthetic: true,
    steps: RECORDED.map((r) => {
      const ran = runSql(db, r.sql);
      if (!ran.ok) throw new Error(`recorded example does not run: ${ran.reason}`);
      return { question: r.question, sql: ran.sql, rows: ran.rows, explanation: r.explanation };
    }),
  };
}

export function scorecardFile(card) {
  return JSON.stringify({ synthetic: true, ...card }, null, 2) + '\n';
}

export function notRunScorecard() {
  return { ...scoreGenerated([]), collectedAt: null, model: null, note: 'Not run yet. No model has been scored. Run pipelines/ledger-api/collect.mjs against a deployed Worker to fill this in.' };
}

function write(rel, text) {
  const out = join(root, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  write('data/ask-the-ledger/schema.sql', schemaFile());
  write('data/ask-the-ledger/seed.sql', seedFile(SEED));
  const rec = JSON.stringify(recordedSession(), null, 2) + '\n';
  write('data/ask-the-ledger/recorded-session.json', rec);
  write('public/data/ask-the-ledger/recorded-session.json', rec);
  const existing = join(pub, 'scorecard.json');
  if (!existsSync(existing) || JSON.parse(readFileSync(existing, 'utf8')).run === 0) {
    const card = scorecardFile(notRunScorecard());
    write('data/ask-the-ledger/scorecard.json', card);
    write('public/data/ask-the-ledger/scorecard.json', card);
  }
}
