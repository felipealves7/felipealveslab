-- Synthetic ledger. Every company, account and amount is invented. Amounts are thousands of AED.
DROP TABLE IF EXISTS ledger;
CREATE TABLE ledger (
  entity TEXT NOT NULL,         -- invented company, e.g. 'North Hub'
  month TEXT NOT NULL,          -- 'YYYY-MM', 2025-01 to 2026-09
  account TEXT NOT NULL,        -- e.g. 'Product sales', 'Payroll'
  account_group TEXT NOT NULL,  -- 'Revenue', 'Cost of sales' or 'Operating expense'
  amount INTEGER NOT NULL       -- thousands of AED, always positive
);
