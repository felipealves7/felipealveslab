// The ledger schema for "Ask the Ledger" (live). One source: sql/schema.sql is generated from this text,
// the model prompt uses it, and the SQL validator takes its table list from it.
// Everything in this database is synthetic.

export const SCHEMA_SQL = `CREATE TABLE cost_centres (
  cost_centre_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE accounts (
  account_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE vendors (
  vendor_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE invoices (
  invoice_id INTEGER PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(vendor_id),
  cost_centre_id INTEGER NOT NULL REFERENCES cost_centres(cost_centre_id),
  account_id INTEGER NOT NULL REFERENCES accounts(account_id),
  invoice_date TEXT NOT NULL, -- YYYY-MM-DD
  due_date TEXT NOT NULL, -- YYYY-MM-DD
  amount_aed REAL NOT NULL, -- whole AED
  status TEXT NOT NULL -- 'paid', 'open' or 'overdue'
);
`;

export const TABLES = ['cost_centres', 'accounts', 'vendors', 'invoices'];
