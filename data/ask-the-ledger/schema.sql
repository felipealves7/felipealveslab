-- Ask the Ledger: schema. Synthetic data only. Run this first in the D1 console.
CREATE TABLE ledger (
  entity  TEXT    NOT NULL, -- company: North Hub, Harbour Retail, Delta Services, Summit Logistics, Orchard Foods, Lakeside Energy
  month   TEXT    NOT NULL, -- 'YYYY-MM', from 2025-01 to 2026-09
  account TEXT    NOT NULL, -- Product sales, Service fees, Materials, Direct labour, Payroll, Rent, Marketing, IT
  grp     TEXT    NOT NULL, -- reporting group: 'Revenue', 'Cost of sales' or 'Operating expense'
  amount  INTEGER NOT NULL  -- AED thousand, always positive
);
CREATE INDEX ledger_month ON ledger (month);
