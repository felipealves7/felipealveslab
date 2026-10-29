// The semantic layer: what each business word means, written down once.
// A question is only answerable if it maps onto one of these definitions.

import { LAST_MONTH, FIRST_MONTH } from './ledger.mjs';

/** Each metric is a formula over the ledger's reporting groups. */
export const METRICS = {
  revenue: {
    label: 'Revenue',
    definition: 'Sum of all accounts in the Revenue group.',
    unit: 'AED thousand',
    compute: (g) => g['Revenue'],
    words: ['revenue', 'sales', 'turnover'],
  },
  cost_of_sales: {
    label: 'Cost of sales',
    definition: 'Sum of all accounts in the Cost of sales group.',
    unit: 'AED thousand',
    compute: (g) => g['Cost of sales'],
    words: ['cost of sales', 'cogs', 'cost of goods sold', 'direct costs'],
  },
  gross_profit: {
    label: 'Gross profit',
    definition: 'Revenue minus cost of sales.',
    unit: 'AED thousand',
    compute: (g) => g['Revenue'] - g['Cost of sales'],
    words: ['gross profit'],
  },
  gross_margin: {
    label: 'Gross margin',
    definition: 'Gross profit divided by revenue, as a percentage. Zero when revenue is zero.',
    unit: '%',
    compute: (g) => (g['Revenue'] === 0 ? 0 : ((g['Revenue'] - g['Cost of sales']) / g['Revenue']) * 100),
    words: ['gross margin'],
  },
  opex: {
    label: 'Operating expenses',
    definition: 'Sum of all accounts in the Operating expense group.',
    unit: 'AED thousand',
    compute: (g) => g['Operating expense'],
    words: ['operating expenses', 'operating costs', 'opex', 'overheads'],
  },
  operating_profit: {
    label: 'Operating profit',
    definition: 'Revenue minus cost of sales minus operating expenses.',
    unit: 'AED thousand',
    compute: (g) => g['Revenue'] - g['Cost of sales'] - g['Operating expense'],
    words: ['operating profit', 'operating income', 'operating result'],
  },
};

/** Words that could mean more than one metric. The translator must ask, not guess. */
export const AMBIGUOUS_WORDS = ['profit', 'profits', 'cost', 'costs', 'expense', 'expenses', 'margin', 'margins'];

/** Things the ledger cannot answer at all. */
export const UNSUPPORTED_WORDS = [
  'ebitda', 'ebit', 'net profit', 'net income', 'cash', 'headcount', 'employees', 'forecast', 'predict',
  'budget', 'tax', 'balance sheet', 'why', 'growth', 'versus', ' vs ', 'compared', 'how many',
];

export const AS_OF = LAST_MONTH;
/** The month in which questions are asked. "Last quarter" and "last month" are counted back from here. */
export const REPORT_MONTH = '2026-10';
export const COVERAGE = { from: FIRST_MONTH, to: LAST_MONTH };

const GROUPS = ['Revenue', 'Cost of sales', 'Operating expense'];

/** Turn a set of ledger rows into the three group totals. */
export function groupTotals(rows) {
  const g = Object.fromEntries(GROUPS.map((n) => [n, 0]));
  for (const r of rows) g[r.group] += r.amount;
  return g;
}

export function quarterOf(month) {
  return `${month.slice(0, 4)}-Q${Math.ceil(Number(month.slice(5)) / 3)}`;
}

/**
 * Run a query spec against the ledger.
 * spec = { metric, from, to, entity?, groupBy?: 'entity' | 'month' | 'quarter', rank?: { dir, n } }
 * Returns { kind: 'scalar', value } | { kind: 'table', rows: [{ label, value }] } | { kind: 'no_data' }.
 */
export function execute(rows, spec) {
  const metric = METRICS[spec.metric];
  const inScope = rows.filter(
    (r) => r.month >= spec.from && r.month <= spec.to && (!spec.entity || r.entity === spec.entity),
  );
  if (inScope.length === 0) return { kind: 'no_data' };
  const round = (v) => (metric.unit === '%' ? Math.round(v * 10) / 10 : Math.round(v));
  if (!spec.groupBy) return { kind: 'scalar', value: round(metric.compute(groupTotals(inScope))) };
  const key = (r) => (spec.groupBy === 'quarter' ? quarterOf(r.month) : r[spec.groupBy]);
  const buckets = new Map();
  for (const r of inScope) {
    const k = key(r);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r);
  }
  let out = [...buckets.entries()].map(([label, rs]) => ({ label, value: round(metric.compute(groupTotals(rs))) }));
  if (spec.rank) {
    out.sort((a, b) => (spec.rank.dir === 'desc' ? b.value - a.value : a.value - b.value) || a.label.localeCompare(b.label));
    out = out.slice(0, spec.rank.n);
  } else {
    out.sort((a, b) => a.label.localeCompare(b.label));
  }
  return { kind: 'table', rows: out };
}
