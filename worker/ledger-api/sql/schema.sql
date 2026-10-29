CREATE TABLE cost_centres (
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
