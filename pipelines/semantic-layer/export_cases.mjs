// Prints every Ask the Ledger benchmark case with its expected outcome on the seeded ledger, as
// JSON. The semantic layer's tests and the four-setup benchmark read their answer keys from here.
// Expected answers come from each suite's own independent calculation over raw account names, so
// they never pass through the semantic layer or SQL.
// Run: node pipelines/semantic-layer/export_cases.mjs [--rows]

import { buildLedger } from '../ask-the-ledger/ledger.mjs';
import { cases } from '../ledger-eval/cases.mjs';

const rows = buildLedger();
if (process.argv.includes('--rows')) {
  console.log(JSON.stringify(rows.map((r) => [r.entity, r.month, r.account, r.group, r.amount])));
} else {
  const out = cases.map((c) => {
    const e = c.expected(rows);
    return {
      id: c.id,
      text: c.text,
      type: c.type,
      suite: c.suite,
      spec: c.spec,
      outcome: e.outcome,
      expected: e.outcome === 'answer' ? e.result : null,
    };
  });
  console.log(JSON.stringify(out));
}
