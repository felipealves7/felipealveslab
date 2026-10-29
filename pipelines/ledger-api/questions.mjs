// The fixed scorecard questions. Each has a hand-written reference query; its result is the expected answer.
// All twelve are answerable from the ledger. No "should decline" questions yet (see the page's limits).

export const QUESTIONS = [
  { id: 1, text: 'What was the total invoiced amount in the first quarter of 2026?', sql: "SELECT SUM(amount_aed) AS total FROM invoices WHERE invoice_date >= '2026-01-01' AND invoice_date < '2026-04-01'" },
  { id: 2, text: 'Which vendor has the highest total invoiced amount?', sql: 'SELECT v.name, SUM(i.amount_aed) AS total FROM invoices i JOIN vendors v ON v.vendor_id = i.vendor_id GROUP BY v.vendor_id ORDER BY total DESC LIMIT 1' },
  { id: 3, text: 'How many invoices are overdue?', sql: "SELECT COUNT(*) AS n FROM invoices WHERE status = 'overdue'" },
  { id: 4, text: 'What is the total amount of unpaid invoices, open and overdue together?', sql: "SELECT SUM(amount_aed) AS total FROM invoices WHERE status IN ('open', 'overdue')" },
  { id: 5, text: 'Total invoiced amount by cost centre, highest first.', sql: 'SELECT c.name, SUM(i.amount_aed) AS total FROM invoices i JOIN cost_centres c ON c.cost_centre_id = i.cost_centre_id GROUP BY c.cost_centre_id ORDER BY total DESC', ordered: true },
  { id: 6, text: 'What is the average invoice amount on the Software account?', sql: "SELECT AVG(i.amount_aed) AS average FROM invoices i JOIN accounts a ON a.account_id = i.account_id WHERE a.name = 'Software'" },
  { id: 7, text: 'How many vendors have no invoices at all?', sql: 'SELECT COUNT(*) AS n FROM vendors WHERE vendor_id NOT IN (SELECT vendor_id FROM invoices)' },
  { id: 8, text: 'Who sent the single largest invoice, and for how much?', sql: 'SELECT v.name, i.amount_aed FROM invoices i JOIN vendors v ON v.vendor_id = i.vendor_id ORDER BY i.amount_aed DESC LIMIT 1' },
  { id: 9, text: 'Total Travel spend for each month of 2026.', sql: "SELECT substr(i.invoice_date, 1, 7) AS month, SUM(i.amount_aed) AS total FROM invoices i JOIN accounts a ON a.account_id = i.account_id WHERE a.name = 'Travel' GROUP BY month ORDER BY month", ordered: true },
  { id: 10, text: 'How many paid invoices does the IT cost centre have?', sql: "SELECT COUNT(*) AS n FROM invoices i JOIN cost_centres c ON c.cost_centre_id = i.cost_centre_id WHERE c.name = 'IT' AND i.status = 'paid'" },
  { id: 11, text: 'Which cost centre has the largest overdue amount?', sql: "SELECT c.name, SUM(i.amount_aed) AS overdue FROM invoices i JOIN cost_centres c ON c.cost_centre_id = i.cost_centre_id WHERE i.status = 'overdue' GROUP BY c.cost_centre_id ORDER BY overdue DESC LIMIT 1" },
  { id: 12, text: 'How much did we spend with vendors in the Software category?', sql: "SELECT SUM(i.amount_aed) AS total FROM invoices i JOIN vendors v ON v.vendor_id = i.vendor_id WHERE v.category = 'Software'" },
];

/** The recorded example session: two questions, answered by the hand-written reference queries. Not model output. */
export const RECORDED = [
  { question: 'Which cost centre has the largest overdue amount?', ref: 11, explanation: 'Adds up the amounts of invoices marked overdue for each cost centre and keeps the largest.' },
  { question: 'How many invoices are overdue?', ref: 3, explanation: 'Counts the invoices whose status is overdue.' },
];
