// Synthetic general ledger for "Ask the Ledger".
// Everything here is invented: six made-up companies, eight made-up accounts, amounts in thousands of AED.
// A fixed seed means the same ledger comes out every time.

import { makeRng } from '../../src/lib/artifacts/prng.mjs';

export const ENTITIES = ['North Hub', 'Harbour Retail', 'Delta Services', 'Summit Logistics', 'Orchard Foods', 'Lakeside Energy'];

/** account name -> reporting group, and its typical size as a share of an entity's monthly revenue. */
export const ACCOUNTS = [
  { account: 'Product sales', group: 'Revenue', share: 0.7 },
  { account: 'Service fees', group: 'Revenue', share: 0.3 },
  { account: 'Materials', group: 'Cost of sales', share: 0.34 },
  { account: 'Direct labour', group: 'Cost of sales', share: 0.18 },
  { account: 'Payroll', group: 'Operating expense', share: 0.22 },
  { account: 'Rent', group: 'Operating expense', share: 0.06 },
  { account: 'Marketing', group: 'Operating expense', share: 0.05 },
  { account: 'IT', group: 'Operating expense', share: 0.04 },
];

export const FIRST_MONTH = '2025-01';
export const LAST_MONTH = '2026-09';

export function monthList(first = FIRST_MONTH, last = LAST_MONTH) {
  const out = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** One row per entity, month and account. Amounts are positive whole numbers (AED thousands). */
export function buildLedger({ seed = 2027 } = {}) {
  const rng = makeRng(seed);
  const months = monthList();
  const rows = [];
  for (const entity of ENTITIES) {
    const scale = rng.int(800, 3200);
    const growth = 1 + rng.int(0, 20) / 1000; // 0% to 2% a month
    months.forEach((month, i) => {
      const season = 1 + 0.08 * Math.sin(((Number(month.slice(5)) - 1) / 12) * 2 * Math.PI);
      const revenue = scale * Math.pow(growth, i) * season;
      for (const a of ACCOUNTS) {
        const noise = 0.92 + rng.next() * 0.16;
        rows.push({ entity, month, account: a.account, group: a.group, amount: Math.round(revenue * a.share * noise) });
      }
    });
  }
  return rows;
}
