// A deliberately simple question-to-query translator: keyword rules, no language model.
// It is the thing being tested, not the point. Anything that turns a question into a query spec
// (including a language model) can be plugged into evaluate.mjs and scored the same way.
//
// Known simplifications, kept on purpose so the scorecard has something to find:
//  - a missing year defaults to the latest year in the data;
//  - it does not understand "excluding", "except" or "without";
//  - it knows only the words listed in semantic.mjs.

import { ENTITIES } from './ledger.mjs';
import { METRICS, AMBIGUOUS_WORDS, UNSUPPORTED_WORDS, AS_OF, REPORT_MONTH, COVERAGE } from './semantic.mjs';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const LATEST_YEAR = Number(AS_OF.slice(0, 4));
const pad = (n) => String(n).padStart(2, '0');

function quarterRange(year, q) {
  return { from: `${year}-${pad((q - 1) * 3 + 1)}`, to: `${year}-${pad(q * 3)}`, label: `Q${q} ${year}` };
}

function previousMonth(month) {
  let [y, m] = month.split('-').map(Number);
  m -= 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  return `${y}-${pad(m)}`;
}

function parsePeriod(t) {
  let m;
  if (/\blast quarter\b/.test(t)) {
    const [y, mo] = REPORT_MONTH.split('-').map(Number);
    const q = Math.ceil(mo / 3);
    return q === 1 ? quarterRange(y - 1, 4) : quarterRange(y, q - 1);
  }
  if (/\blast month\b/.test(t)) {
    const p = previousMonth(REPORT_MONTH);
    return { from: p, to: p, label: p };
  }
  if (/\bthis year\b/.test(t)) return { from: `${LATEST_YEAR}-01`, to: AS_OF, label: `${LATEST_YEAR} to date` };
  if (/\blast year\b/.test(t)) return { from: `${LATEST_YEAR - 1}-01`, to: `${LATEST_YEAR - 1}-12`, label: String(LATEST_YEAR - 1) };
  if ((m = t.match(/\bq([1-4])\s*(?:of\s*)?(20\d\d)\b/))) return quarterRange(Number(m[2]), Number(m[1]));
  if ((m = t.match(/\b(20\d\d)\s*q([1-4])\b/))) return quarterRange(Number(m[1]), Number(m[2]));
  const monthName = MONTHS.find((name) => new RegExp(`\\b${name}\\b`).test(t));
  if (monthName) {
    const yr = t.match(/\b(20\d\d)\b/);
    const year = yr ? Number(yr[1]) : LATEST_YEAR;
    const mm = `${year}-${pad(MONTHS.indexOf(monthName) + 1)}`;
    return { from: mm, to: mm, label: mm };
  }
  if ((m = t.match(/\bq([1-4])\b/))) return quarterRange(LATEST_YEAR, Number(m[1]));
  if ((m = t.match(/\b(20\d\d)\b/))) {
    const y = Number(m[1]);
    const to = y === LATEST_YEAR ? AS_OF : `${y}-12`;
    return { from: `${y}-01`, to, label: String(y) };
  }
  return { from: COVERAGE.from, to: COVERAGE.to, label: 'all periods' };
}

/** Find the metric. Longest matching phrase wins. Returns { metric } or { refuse }. */
function parseMetric(t) {
  const hits = [];
  for (const [key, def] of Object.entries(METRICS)) {
    for (const w of def.words) if (new RegExp(`\\b${w}\\b`).test(t)) hits.push({ key, w });
  }
  // A word inside a longer matched phrase does not count: "sales" in "cost of sales" is not revenue.
  const kept = hits.filter((h) => !hits.some((o) => o.key !== h.key && o.w.length > h.w.length && o.w.includes(h.w)));
  const keys = [...new Set(kept.map((h) => h.key))];
  if (keys.length === 1) return { metric: keys[0] };
  if (keys.length > 1) return { refuse: 'ambiguous_metric' };
  if (AMBIGUOUS_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(t))) return { refuse: 'ambiguous_metric' };
  return { refuse: 'unknown_metric' };
}

export function translate(question) {
  const t = ` ${question.toLowerCase().replace(/[?.,!]/g, ' ').replace(/\s+/g, ' ')} `;
  if (UNSUPPORTED_WORDS.some((w) => t.includes(` ${w.trim()} `))) {
    return { outcome: 'refuse', reason: 'unsupported' };
  }
  const m = parseMetric(t);
  if (m.refuse) return { outcome: 'refuse', reason: m.refuse };

  const period = parsePeriod(t);
  const spec = { metric: m.metric, from: period.from, to: period.to, periodLabel: period.label };

  const entity = ENTITIES.find((e) => t.includes(e.toLowerCase()));
  if (entity) spec.entity = entity;

  if (/\b(by|each|per) (entity|company)\b|\bwhich (entity|company)\b|\bentities\b/.test(t)) spec.groupBy = 'entity';
  else if (/\bby month\b|\bmonthly\b|\beach month\b/.test(t)) spec.groupBy = 'month';
  else if (/\bby quarter\b|\bquarterly\b|\beach quarter\b/.test(t)) spec.groupBy = 'quarter';

  let r;
  if ((r = t.match(/\b(top|bottom) (\d+)\b/))) {
    spec.groupBy = spec.groupBy ?? 'entity';
    spec.rank = { dir: r[1] === 'top' ? 'desc' : 'asc', n: Number(r[2]) };
  } else if (/\b(highest|largest|biggest|most)\b/.test(t)) {
    spec.groupBy = spec.groupBy ?? 'entity';
    spec.rank = { dir: 'desc', n: 1 };
  } else if (/\b(lowest|smallest|least)\b/.test(t)) {
    spec.groupBy = spec.groupBy ?? 'entity';
    spec.rank = { dir: 'asc', n: 1 };
  }
  if (spec.entity && spec.groupBy === 'entity' && !spec.rank) delete spec.groupBy;
  return { outcome: 'answer', spec };
}
