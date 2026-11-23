// Brazil hourly power price lab: the daily price chart (charts/pld_daily.py), with its period
// buttons and the yearly table, from the saved results. No figure here is typed in by hand.
import { altairFigure, tableHtml } from './figure.mjs';

export const SUBMARKETS = ['SUDESTE', 'SUL', 'NORDESTE', 'NORTE'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const int = (n) => new Intl.NumberFormat('en-GB').format(n);
const two = (n) => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
export const longDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

// The daily series the chart reads, checked the way the chart needs it.
export function pldDaily(results) {
  const summary = results?.summary;
  const daily = summary?.daily;
  if (!daily || !Array.isArray(daily.dates) || !daily.series) throw new Error('PLD results have no daily series');
  const n = daily.dates.length;
  if (n < 2) throw new Error('PLD daily series is too short to draw');
  for (const s of SUBMARKETS) {
    if (!Array.isArray(daily.series[s]) || daily.series[s].length !== n) throw new Error(`PLD series ${s} does not match the dates`);
  }
  if (daily.dates[0] !== summary.first || daily.dates[n - 1] !== summary.last) throw new Error('PLD daily dates do not match the summary');
  const years = [...new Set(daily.dates.map((d) => d.slice(0, 4)))];
  return { dates: daily.dates, series: daily.series, first: daily.dates[0], last: daily.dates[n - 1], days: n, years };
}

export function pldYearlyTable(results) {
  const yearly = results.summary.yearly ?? [];
  const years = [...new Set(yearly.map((r) => r.year))].sort();
  const cell = (year, s) => { const r = yearly.find((q) => q.year === year && q.submarket === s); return r ? two(r.mean) : '–'; };
  return tableHtml(['Year', ...SUBMARKETS], years.map((y) => [String(y), ...SUBMARKETS.map((s) => cell(y, s))]))
    + '<p>Mean hourly price by year and submarket, R$/MWh.</p>';
}

export async function pldFigure(results, vlSpec) {
  const d = pldDaily(results);
  return altairFigure({
    id: 'pld-daily-chart',
    vlSpec,
    title: 'Daily mean price by submarket',
    subtitle: `${int(d.days)} days, ${longDate(d.first)} to ${longDate(d.last)} · day level · R$/MWh, the unweighted mean of each day's 24 hourly prices`,
    label: `Daily mean power price in R$/MWh for the four Brazilian submarkets, ${longDate(d.first)} to ${longDate(d.last)}, one panel each on one scale from zero. Each panel title gives its highest daily mean. The yearly figures are in the table below.`,
    controls: [{
      param: 'period',
      label: 'Period',
      options: [{ value: 'all', label: `All, ${d.years[0]} to ${d.years[d.years.length - 1]}` }, ...d.years.map((y) => ({ value: y, label: y }))],
    }],
    hint: 'Hover or tap a panel for all four prices that day. On a keyboard, tab to the chart and use the arrow keys.',
    table: pldYearlyTable(results),
    source: 'Source: <code>data/ccee-pld/results.json</code>. Chart made with Altair in <code>charts/pld_daily.py</code> and drawn when the site is built.',
  });
}
