// Four versions of the ledger. A query is right only if it is right on all of them, so a query that
// returns a constant, or hard-codes a period's total, passes the first ledger and fails the others.
import { buildLedger } from '../ask-the-ledger/ledger.mjs';

export function scenarios() {
  const base = buildLedger();
  return [
    { name: 'original_seed_2027', rows: base },
    { name: 'new_seed_2028', rows: buildLedger({ seed: 2028 }) },
    { name: 'zero_revenue', rows: base.map((r) => ({ ...r, amount: r.group === 'Revenue' ? 0 : r.amount })) },
    {
      name: 'selective_perturbation',
      rows: base.map((r, i) => ({ ...r, amount: r.entity === 'North Hub' && r.month === '2025-03' ? r.amount * 3 + 7 : r.amount + (i % 5) })),
    },
  ];
}
