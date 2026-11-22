---
title: "Brazil hourly power price with a data contract"
type: "production-like demo"
lane: "data engineering"
status: "live"
question: "Can a small pipeline load Brazil's hourly power spot price (PLD), enforce a written data contract, and show which published values were later revised or went missing?"
payer: "A finance, risk or trading-support team that prices energy exposure from a public price series and needs to know when the series has gaps, changes shape or is restated before a report goes out."
dataSource: "CCEE open data, PLD_HORARIO (hourly PLD by submarket), https://dadosabertos.ccee.org.br/dataset/pld_horario. Files for 2021 to 2026, downloaded 14 Nov 2026."
dataLicence: "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), as named on the dataset page, and CCEE's site terms of use. Attribution: Câmara de Comercialização de Energia Elétrica (CCEE)."
dataFreshness: 2026-11-14
synthetic: false
limits: "One snapshot so far, so no restatement has been looked for yet. Refreshes are manual downloads because CCEE refuses automated ones. It checks shape, completeness and ranges, not whether a price is right. Plain Node, not dlt, dbt and DuckDB."
runningCost: "US$0 a month. No scheduled job and no live service; the page reads one saved file from this site."
builtBy: "https://github.com/felipealves7/felipealveslab/pull/49"
published: 2026-11-15
---

## The question

Can a small pipeline load Brazil's hourly power spot price (PLD), enforce a written data contract, and show which published values were later revised or went missing? A finance, risk or trading-support team that prices energy exposure from this public series would pay to know about gaps, changes of shape and restated values before a report goes out.

## The live piece

Pick a period to see the daily price in each of the four submarkets, and a saved run to see its 13 checks. Everything below is read from `data/ccee-pld/results.json`, saved with the page. Nothing is fetched from CCEE.

<div data-lab-chart="pld"></div>

<div id="pld-explorer" class="pld-live" data-src="/data/ccee-pld/results.json"><p>The explorer needs JavaScript. The saved runs and figures are in <code>data/ccee-pld/results.json</code> and the code is in <code>pipelines/ccee-pld/</code>.</p></div>

## Method and results

### Result

- **First real run, 15 Nov 2026, on the files downloaded 14 Nov 2026: passed 13 of 13 checks.** 205,824 hourly prices in six yearly files, 1 Jan 2021 to 14 Nov 2026: 2,144 days, each with 24 hours for each of the four submarkets. No bad row, no duplicate, no missing day.
- **Rehearsed break, same day: failed, with one cause.** Renaming `PLD_HORA` to `PLD` in the 2026 file, in memory only, failed `file.columns`. The two price checks that read that column were marked "not run" and reported under the same cause, "Column PLD_HORA is missing from pld_horario_2026.csv". The other 10 checks passed.
- **Restatements: none looked for yet.** One snapshot is saved, and one snapshot cannot be compared with anything. The comparison code is tested on made-up files; the first real comparison comes with the next download.

### Data

Six yearly CSV files from CCEE's [PLD_HORARIO dataset](https://dadosabertos.ccee.org.br/dataset/pld_horario), kept unchanged in `data/ccee-pld-horario/` with their SHA-256 hashes. Each row is one hour for one submarket: `NORDESTE`, `NORTE`, `SUDESTE` or `SUL`. The dataset page does not state the unit; the figures here are read as R$/MWh, which this page has not verified from CCEE. The files come in two shapes, and the loader accepts both and records which it saw:

- 2021 to 2024: every text field quoted, Windows line endings, oldest hour first.
- 2025 and 2026: no quotes, Unix line endings. The 2026 file lists the newest day first. The 2025 file lists its months in no fixed order.
- Inside the 2025 file the format also drifts: 2,592 rows, days 1 to 9 of August, September and October, write the day with a leading zero (`07`), the rest without (`7`). The loader reads days as numbers, so `07` and `7` are the same day.

### The contract: 13 checks

| Scope | Check | Rule |
| --- | --- | --- |
| File | `file.columns` | Each file has the six columns the pipeline reads |
| Row | `row.month` | `MES_REFERENCIA` is a month (YYYYMM) in the file's year |
| Row | `row.submarket` | `SUBMERCADO` is one of the four codes |
| Row | `row.day` | `DIA` exists in that month |
| Row | `row.hour` | `HORA` is a whole hour from 0 to 23 |
| Row | `row.period` | `PERIODO_COMERCIALIZACAO` equals (DIA − 1) × 24 + HORA + 1 |
| Row | `row.price_number` | `PLD_HORA` is a number with at most two decimals |
| Row | `row.price_bounds` | `PLD_HORA` is between 1 and 5,000 |
| Set | `set.key_unique` | Each month, submarket, day and hour appears once across all files |
| Set | `set.day_24_hours` | Every submarket has exactly the hours 0 to 23 on every day |
| Set | `set.all_submarkets` | Every day and hour has all four submarkets |
| Set | `set.no_missing_days` | Every day from 1 Jan 2021 to the newest day is present |
| Set | `set.fresh` | The newest priced day is at most 3 days before the download date |

Every check has tolerance zero: one bad row fails the run. `set.day_24_hours` is the daylight-saving check: a 23-hour or 25-hour day fails it. `row.period` checks the same thing from the hour count CCEE writes in each row. The price bounds are sanity bounds chosen for this contract to catch unit and decimal errors. They are not CCEE's regulatory floor and ceiling.

### Revision tracking

Each real run saves a snapshot: the file hashes and a SHA-256 fingerprint of each month's rows, sorted, so quoting, line endings and row order do not change it. 71 months are fingerprinted. The next run compares fingerprints and names the months CCEE rewrote, added or dropped. Run with `--previous <folder>` holding the older files, it also lists each hour whose price changed and each hour that went missing. New hours at the end of the series are expected, because the PLD is published each day for the next day.

### Figures

The chart and the yearly table use the plain mean of each day's 24 hourly prices. They are not weighted by load, and they are this Lab's figures, not CCEE's. The highest hourly price in the files is 1,611.04, in all four submarkets, on 1 Sep 2026 at 18:00. Mean hourly price in `SUDESTE` by year: 280.50 (2021), 59.05 (2022), 72.16 (2023), 128.16 (2024), 224.31 (2025) and 194.92 (2026 to 14 Nov).

### Tests

14 tests in `pipelines/ccee-pld/pld.test.mjs`: one for the line reader, one showing both file shapes give the same rows and fingerprints, one clean file, six fault tests on small made-up files (renamed column, 23-hour day, 25-hour day, missing submarket or day or unknown code, wrong hour count or day or year or price, stale files), three for snapshots and comparisons, one for the daily mean, and one that runs the contract on the real files. `scripts/pld-page.test.mjs` pins the figures on this page to the saved results. The chart has its own checks: `scripts/altair-charts.test.mjs` draws it from the saved results, and `python3 charts/build.py --check` confirms its saved spec is the one `charts/pld_daily.py` makes.

### How to rerun

- `node pipelines/ccee-pld/run.mjs --retrieved 2026-11-14` checks the files in `data/ccee-pld-horario/` and appends one run to `data/ccee-pld/results.json`.
- `node pipelines/ccee-pld/run.mjs --retrieved 2026-11-14 --rename pld_horario_2026.csv:PLD_HORA=PLD` repeats the rehearsal.
- `node --test pipelines/ccee-pld/pld.test.mjs scripts/pld-page.test.mjs` runs the tests.

## Known limits and running cost

- **One snapshot.** Revision tracking needs at least two downloads. Until then the page reports that none has been looked for, not that there are none.
- **Manual refresh.** CCEE's portal refuses automated downloads from cloud servers (HTTP 403), so there is no scheduled job. A refresh is a browser download into `data/ccee-pld-horario/`, then one run. The badge turns to "Refresh due" 7 days after the last download.
- **Old files are only in git history.** Hour-level comparison needs the older download in a folder. Month fingerprints work without it.
- **It checks shape, not truth.** Columns, codes, whole days, ranges and freshness. It cannot tell whether a published price is right.
- **The unit and column meanings are read from the values.** The dataset page defines neither.
- **Licence terms.** The dataset page names CC BY 4.0 and also points to [CCEE's site terms of use](https://www.ccee.org.br/web/guest/termos-de-uso), updated 13 Oct 2025. Those terms allow non-profit reproduction of public content if it is kept intact and the source and the date and time of extraction are cited. The files here are unchanged and cite the source and the download date; the time of download was not recorded.
- **Not the tools named in the proposal.** Plain Node with no dependencies, as in the [airport pipeline](/lab/airport-data-contract), not dlt, DuckDB and dbt.
- **Cost:** US$0 a month. No scheduled job and no live service.

## How it was built

- Pull request: https://github.com/felipealves7/felipealveslab/pull/49
- Code: `pipelines/ccee-pld/` and `public/js/pld-explorer.js`. Chart: `charts/pld_daily.py` in Altair, with the site's chart theme in `charts/theme.py`, drawn by `src/lib/charts/`. Saved runs and figures: `data/ccee-pld/`. Raw files: `data/ccee-pld-horario/`. Tests: `pipelines/ccee-pld/pld.test.mjs` and `scripts/pld-page.test.mjs`.

Data: Câmara de Comercialização de Energia Elétrica (CCEE), PLD_HORARIO, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Daily means and yearly figures computed by this Lab.
