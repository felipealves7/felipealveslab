// Figures for the page, computed from rows that passed the contract. Prices in R$/MWh as published.
// A daily price here is the plain mean of the day's 24 hourly prices, not weighted by load.
import { SUBMARKETS } from './contract.mjs';

const round2 = (x) => Math.round(x * 100) / 100;

export function summarise(files) {
  const days = new Map(); // date -> { sub: [sum, n] }
  const years = new Map(); // year|sub -> { sum, n, min, max, minAt, maxAt }
  for (const f of files) for (const r of f.rows) {
    const date = `${r.MES_REFERENCIA.slice(0, 4)}-${r.MES_REFERENCIA.slice(4)}-${String(Number(r.DIA)).padStart(2, '0')}`;
    const v = Number(r.PLD_HORA);
    const s = r.SUBMERCADO;
    if (!days.has(date)) days.set(date, {});
    const d = days.get(date);
    d[s] = d[s] ?? [0, 0];
    d[s][0] += v; d[s][1]++;
    const yk = `${date.slice(0, 4)}|${s}`;
    const y = years.get(yk) ?? { sum: 0, n: 0, min: Infinity, max: -Infinity, minAt: '', maxAt: '' };
    y.sum += v; y.n++;
    const at = `${date} ${String(Number(r.HORA)).padStart(2, '0')}:00`;
    if (v < y.min) { y.min = v; y.minAt = at; }
    if (v > y.max) { y.max = v; y.maxAt = at; }
    years.set(yk, y);
  }
  const dates = [...days.keys()].sort();
  const daily = {
    dates,
    // One array per submarket, aligned with dates; null where a day is missing.
    series: Object.fromEntries(SUBMARKETS.map((s) => [s, dates.map((d) => (days.get(d)[s] ? round2(days.get(d)[s][0] / days.get(d)[s][1]) : null))])),
  };
  const yearly = [...years.entries()].map(([k, y]) => {
    const [year, submarket] = k.split('|');
    return { year: Number(year), submarket, hours: y.n, mean: round2(y.sum / y.n), min: y.min, minAt: y.minAt, max: y.max, maxAt: y.maxAt };
  }).sort((a, b) => a.year - b.year || a.submarket.localeCompare(b.submarket));
  return { first: dates[0], last: dates.at(-1), days: dates.length, daily, yearly };
}
