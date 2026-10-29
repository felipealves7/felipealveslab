// Builds the recorded example session shown when the caps are hit or the Worker is unreachable.
// The two queries below were written by hand, NOT by a model. Each one goes through the Worker's
// validator and runs on the seeded ledger, so the rows are computed, not typed in.
//   node pipelines/ledger-api/record-session.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLedger } from './score-sql.mjs';
import { validateSql } from './validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const EXAMPLES = [
  {
    question: 'Which entity had the highest revenue in 2025?',
    sql: "SELECT entity, SUM(amount) AS revenue FROM ledger WHERE account_group = 'Revenue' AND month BETWEEN '2025-01' AND '2025-12' GROUP BY entity ORDER BY revenue DESC LIMIT 1",
    explanation: 'Adds up every Revenue account for each company across 2025 and keeps the largest. Amounts are thousands of AED.',
  },
  {
    question: 'What was operating profit by entity in Q3 2026?',
    sql: "SELECT entity, SUM(CASE account_group WHEN 'Revenue' THEN amount ELSE -amount END) AS operating_profit FROM ledger WHERE month BETWEEN '2026-07' AND '2026-09' GROUP BY entity ORDER BY entity",
    explanation: 'Operating profit is revenue minus cost of sales minus operating expenses, so revenue counts as plus and the other two groups as minus. Amounts are thousands of AED.',
  },
];

export function buildSession() {
  const db = openLedger();
  return {
    kind: 'recorded example, not live',
    synthetic: true,
    note: 'The queries were written by hand to show the shape of an answer. They are not model output. The rows were computed by running them on the synthetic ledger.',
    examples: EXAMPLES.map((e) => {
      const v = validateSql(e.sql);
      if (!v.ok) throw new Error(`example rejected: ${v.reason}`);
      return { ...e, sql: v.sql, rows: db.prepare(v.sql).all().map((r) => ({ ...r })) };
    }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = JSON.stringify(buildSession(), null, 2) + '\n';
  for (const dir of ['data/ledger-api', 'public/data/ledger-api']) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, 'recorded-session.json'), text);
  }
  console.log('wrote recorded-session.json');
}
