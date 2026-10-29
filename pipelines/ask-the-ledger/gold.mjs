// The test set: questions a finance user might ask, each with the right outcome decided by hand.
// "answer" questions get their true value from truth() below, which reads the raw rows directly
// and does not use the semantic layer, so the two cannot share a bug.
// "refuse" questions are ones where a careful analyst would ask back or say the ledger cannot tell.

import { ENTITIES } from './ledger.mjs';

const sumWhere = (rows, f, accounts) =>
  rows.filter((r) => f(r) && accounts.includes(r.account)).reduce((s, r) => s + r.amount, 0);

const REV = ['Product sales', 'Service fees'];
const COS = ['Materials', 'Direct labour'];
const OPX = ['Payroll', 'Rent', 'Marketing', 'IT'];
const q = (month) => `${month.slice(0, 4)}-Q${Math.ceil(Number(month.slice(5)) / 3)}`;

/** Independent calculation of a figure. kind: revenue | cos | gp | gm | opex | op */
function figure(rows, kind, f) {
  const rev = sumWhere(rows, f, REV);
  const cos = sumWhere(rows, f, COS);
  const opx = sumWhere(rows, f, OPX);
  switch (kind) {
    case 'revenue': return rev;
    case 'cos': return cos;
    case 'gp': return rev - cos;
    case 'gm': return rev === 0 ? 0 : Math.round(((rev - cos) / rev) * 1000) / 10;
    case 'opex': return opx;
    case 'op': return rev - cos - opx;
    default: throw new Error(kind);
  }
}
const rnd = (kind, v) => (kind === 'gm' ? v : Math.round(v));

function scalar(kind, f) {
  return (rows) => ({ kind: 'scalar', value: rnd(kind, figure(rows, kind, f)) });
}
function table(kind, f, by, { dir, n } = {}) {
  return (rows) => {
    const keyOf = by === 'entity' ? (r) => r.entity : by === 'month' ? (r) => r.month : (r) => q(r.month);
    const keys = [...new Set(rows.filter(f).map(keyOf))];
    let out = keys.map((k) => ({ label: k, value: rnd(kind, figure(rows, kind, (r) => f(r) && keyOf(r) === k)) }));
    if (dir) {
      out.sort((a, b) => (dir === 'desc' ? b.value - a.value : a.value - b.value) || a.label.localeCompare(b.label));
      out = out.slice(0, n);
    } else out.sort((a, b) => a.label.localeCompare(b.label));
    return { kind: 'table', rows: out };
  };
}

const yr = (y, last = '12') => (r) => r.month >= `${y}-01` && r.month <= `${y}-${last}`;
const qt = (y, n) => (r) => r.month >= `${y}-${String((n - 1) * 3 + 1).padStart(2, '0')}` && r.month <= `${y}-${String(n * 3).padStart(2, '0')}`;
const mo = (m) => (r) => r.month === m;
const ent = (name, f) => (r) => r.entity === name && f(r);
const all = () => true;

/** type: how hard the question is meant to be. */
export const QUESTIONS = [
  // Plain questions the translator should get right
  ['What was total revenue in 2025?', 'plain', scalar('revenue', yr(2025))],
  ['What was revenue in 2026?', 'plain', scalar('revenue', yr(2026, '09'))],
  ['Revenue in Q1 2026', 'plain', scalar('revenue', qt(2026, 1))],
  ['What was gross profit in Q4 2025?', 'plain', scalar('gp', qt(2025, 4))],
  ['What was the gross margin in 2025?', 'plain', scalar('gm', yr(2025))],
  ['What was operating profit in 2026?', 'plain', scalar('op', yr(2026, '09'))],
  ['Operating expenses in March 2026', 'plain', scalar('opex', mo('2026-03'))],
  ['Cost of sales in 2025', 'plain', scalar('cos', yr(2025))],
  ['Revenue by entity in 2025', 'plain', table('revenue', yr(2025), 'entity')],
  ['Operating profit by entity in Q3 2026', 'plain', table('op', qt(2026, 3), 'entity')],
  ['Revenue by month in 2025', 'plain', table('revenue', yr(2025), 'month')],
  ['Revenue by quarter in 2025', 'plain', table('revenue', yr(2025), 'quarter')],
  ['Which entity had the highest revenue in 2025?', 'plain', table('revenue', yr(2025), 'entity', { dir: 'desc', n: 1 })],
  ['Which entity had the lowest gross margin in 2026?', 'plain', table('gm', yr(2026, '09'), 'entity', { dir: 'asc', n: 1 })],
  ['Top 3 entities by operating expenses in Q2 2026', 'plain', table('opex', qt(2026, 2), 'entity', { dir: 'desc', n: 3 })],
  ['Revenue of North Hub in 2025', 'plain', scalar('revenue', ent('North Hub', yr(2025)))],
  ['Operating profit for Delta Services in Q1 2026', 'plain', scalar('op', ent('Delta Services', qt(2026, 1)))],
  ['What was revenue last quarter?', 'plain', scalar('revenue', qt(2026, 3))],
  ['Gross profit last month', 'plain', scalar('gp', mo('2026-09'))],
  ['Operating expenses this year', 'plain', scalar('opex', yr(2026, '09'))],
  ['Sales in 2026', 'plain', scalar('revenue', yr(2026, '09'))],
  ['Turnover for Harbour Retail in 2025', 'plain', scalar('revenue', ent('Harbour Retail', yr(2025)))],
  ['COGS in Q2 2025', 'plain', scalar('cos', qt(2025, 2))],
  ['Gross margin by entity in 2025', 'plain', table('gm', yr(2025), 'entity')],
  ['What is total revenue?', 'plain', scalar('revenue', all)],
  ['Bottom 2 entities by revenue in 2026', 'plain', table('revenue', yr(2026, '09'), 'entity', { dir: 'asc', n: 2 })],
  ['Monthly revenue for Summit Logistics in 2026', 'plain', table('revenue', ent('Summit Logistics', yr(2026, '09')), 'month')],
  ['Quarterly operating profit in 2026', 'plain', table('op', yr(2026, '09'), 'quarter')],
  ['Gross profit by entity last year', 'plain', table('gp', yr(2025), 'entity')],
  ['Which entity had the highest operating profit last quarter?', 'plain', table('op', qt(2026, 3), 'entity', { dir: 'desc', n: 1 })],
  // Same meaning, different words or shape: easy for a person, hard for keyword rules
  ['How much did we sell in 2025?', 'paraphrase', scalar('revenue', yr(2025))],
  ['What did Orchard Foods bring in during 2025?', 'paraphrase', scalar('revenue', ent('Orchard Foods', yr(2025)))],
  ['Revenue for the first half of 2026', 'paraphrase', scalar('revenue', (r) => r.month >= '2026-01' && r.month <= '2026-06')],
  ['Revenue in 2025 excluding Delta Services', 'paraphrase', scalar('revenue', (r) => r.entity !== 'Delta Services' && yr(2025)(r))],
  // The question does not say enough, or the words mean two things: the right move is to ask back
  ['What was the profit in 2025?', 'ambiguous', 'refuse'],
  ['What were our costs in 2026?', 'ambiguous', 'refuse'],
  ['Revenue in Q2', 'ambiguous', 'refuse'],
  ['Revenue in March', 'ambiguous', 'refuse'],
  // The ledger cannot answer
  ['What was EBITDA in 2025?', 'unsupported', 'refuse'],
  ['Forecast revenue for Q4 2026', 'unsupported', 'refuse'],
  ['Why did operating expenses rise in 2026?', 'unsupported', 'refuse'],
  ['Revenue in Q4 2026', 'unsupported', 'refuse'],
  ['Headcount by entity', 'unsupported', 'refuse'],
  ['Revenue growth 2026 vs 2025', 'unsupported', 'refuse'],
  ['What was net profit in 2025?', 'unsupported', 'refuse'],
  ['How many entities are there?', 'unsupported', 'refuse'],
  ['What was the operating profit margin in 2026?', 'unsupported', 'refuse'],
].map(([text, type, gold], i) => ({ id: i + 1, text, type, gold }));

/** The true outcome for a question, computed from the raw rows. */
export function truth(rows, question) {
  if (question.gold === 'refuse') return { outcome: 'refuse' };
  return { outcome: 'answer', result: question.gold(rows) };
}

export { ENTITIES };
