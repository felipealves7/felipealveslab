# airport-contract

Saved output of `pipelines/airport-contract/run.mjs`. Not synthetic.

- **File:** `results.json` (copied to `public/data/airport-contract/results.json` for the page). One record per run, last 52 kept.
- **Source:** OurAirports open data, https://ourairports.com/data/ . Files are fetched from https://davidmegginson.github.io/ourairports-data/ (airports.csv, runways.csv, countries.csv), the published copy of https://github.com/davidmegginson/ourairports-data .
- **Licence:** the data page says "All data is released to the Public Domain" with no guarantee of accuracy. The repository LICENSE is the Unlicense. Both opened 2026-10-29.
- **Cadence:** the data page says the files are updated every night.
- **Retrieved:** 2026-10-29. The raw CSVs (about 17 MB) are not stored here; only each run's check results are.
- **Runs:** one real run, and one run marked `deliberate: true` in which the column `iso_country` was renamed in memory to rehearse an upstream break. Upstream was not changed.
- **Fields per run:** run date, status, row and column counts, upstream `Last-Modified` and its age, and for each of 19 checks: rows checked, rows failing, tolerance, up to three examples.
