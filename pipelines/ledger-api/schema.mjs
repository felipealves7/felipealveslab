// The ledger schema the Worker shows the model and the validator enforces.
// The data is the synthetic ledger from pipelines/ask-the-ledger/ledger.mjs. Nothing here is real.

import { buildLedger } from '../ask-the-ledger/ledger.mjs';

export const TABLES = ['ledger'];

export const SCHEMA_SQL = `CREATE TABLE ledger (
  entity  TEXT    NOT NULL, -- company: North Hub, Harbour Retail, Delta Services, Summit Logistics, Orchard Foods, Lakeside Energy
  month   TEXT    NOT NULL, -- 'YYYY-MM', from 2025-01 to 2026-09
  account TEXT    NOT NULL, -- Product sales, Service fees, Materials, Direct labour, Payroll, Rent, Marketing, IT
  grp     TEXT    NOT NULL, -- reporting group: 'Revenue', 'Cost of sales' or 'Operating expense'
  amount  INTEGER NOT NULL  -- AED thousand, always positive
);
CREATE INDEX ledger_month ON ledger (month);
`;

/** Business definitions given to the model, so "gross margin" means one thing. */
export const DEFINITIONS = `Revenue = sum of amount where grp = 'Revenue'.
Cost of sales = sum of amount where grp = 'Cost of sales'.
Gross profit = revenue - cost of sales.
Gross margin = gross profit / revenue * 100, as a percentage rounded to 1 decimal place.
Operating expenses = sum of amount where grp = 'Operating expense'.
Operating profit = revenue - cost of sales - operating expenses.
Amounts are in AED thousand. Today is 2026-10-29, so "last quarter" is 2026-Q3 and "this year" is 2026 (data ends 2026-09).`;

const q = (s) => `'${String(s).replaceAll("'", "''")}'`;

/** schema.sql for the D1 console. */
export function schemaFile() {
  return `-- Ask the Ledger: schema. Synthetic data only. Run this first in the D1 console.\n${SCHEMA_SQL}`;
}

/** seed.sql for the D1 console: 100 rows per INSERT. */
export function seedFile(seed = 2027) {
  const rows = buildLedger({ seed });
  const out = [`-- Ask the Ledger: seed. ${rows.length} synthetic rows, seed ${seed}. Run after schema.sql.`];
  for (let i = 0; i < rows.length; i += 100) {
    const values = rows.slice(i, i + 100).map((r) => `(${q(r.entity)}, ${q(r.month)}, ${q(r.account)}, ${q(r.group)}, ${r.amount})`);
    out.push(`INSERT INTO ledger (entity, month, account, grp, amount) VALUES\n${values.join(',\n')};`);
  }
  return out.join('\n') + '\n';
}
