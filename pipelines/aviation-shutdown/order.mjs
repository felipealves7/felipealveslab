// The FAA's emergency order of 6 November 2025, as the shutdown analysis uses it: the 40 "High Impact
// Airports" where airlines had to cut scheduled domestic operations, and the cut in force on each day.
//
// Airports: Appendix A of the order, Federal Register, 12 November 2025:
// https://www.govinfo.gov/content/pkg/FR-2025-11-12/html/2025-19850.htm
// The order set 4% from 7 November, 6% from 11 November, 8% from 13 November and 10% from 14 November.
// As applied, the cut stayed at 6%, fell to 3% for 15 and 16 November, and was lifted from 6 a.m. EST on
// 17 November (sources in data/aviation-shutdown/README.md).

export const ORDER_SOURCE = 'https://www.govinfo.gov/content/pkg/FR-2025-11-12/html/2025-19850.htm';

export const HIGH_IMPACT = Object.freeze([
  'ANC', 'ATL', 'BOS', 'BWI', 'CLT', 'CVG', 'DAL', 'DCA', 'DEN', 'DFW',
  'DTW', 'EWR', 'FLL', 'HNL', 'HOU', 'IAD', 'IAH', 'IND', 'JFK', 'LAS',
  'LAX', 'LGA', 'MCO', 'MDW', 'MEM', 'MIA', 'MSP', 'OAK', 'ONT', 'ORD',
  'PDX', 'PHL', 'PHX', 'SAN', 'SDF', 'SEA', 'SFO', 'SLC', 'TEB', 'TPA',
]);
const LISTED = new Set(HIGH_IMPACT);

/** The cut in force each day, as applied. Dates are local calendar days, inclusive. */
export const APPLIED_CUTS = Object.freeze([
  { from: '2025-11-07', to: '2025-11-10', cut: 4 },
  { from: '2025-11-11', to: '2025-11-14', cut: 6 },
  { from: '2025-11-15', to: '2025-11-16', cut: 3 },
]);

/** Percentage cut in force on an ISO date, 0 when none. */
export function cutOn(date) {
  const step = APPLIED_CUTS.find((s) => date >= s.from && date <= s.to);
  return step ? step.cut : 0;
}

/** How exposed a flight was to the order: listed airports at both ends, at one end, or at neither. */
export function exposure(origin, dest) {
  const n = (LISTED.has(origin) ? 1 : 0) + (LISTED.has(dest) ? 1 : 0);
  return n === 2 ? 'both' : n === 1 ? 'one' : 'none';
}

export const EXPOSURES = Object.freeze(['both', 'one', 'none']);

export const isListed = (airport) => LISTED.has(airport);
