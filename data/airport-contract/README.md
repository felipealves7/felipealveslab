# airport-contract

Saved output of `pipelines/airport-contract/run.mjs`. Not synthetic.

- **File:** `results.json` (copied to `public/data/airport-contract/results.json` for the page). One record per run, passed or failed, newest last; the latest 52 are kept.
- **Source:** OurAirports open data, https://ourairports.com/data/ . Files are fetched from https://davidmegginson.github.io/ourairports-data/ (airports.csv, runways.csv, countries.csv), the published copy of https://github.com/davidmegginson/ourairports-data .
- **Licence:** the data page says "All data is released to the Public Domain" with no guarantee of accuracy. The repository LICENSE is the Unlicense. Both opened 2026-10-29.
- **Cadence:** the data page says the files are updated every night. The pipeline runs every Monday at 03:17 UTC and after each change to it, through `.github/workflows/airport-contract.yml`.
- **Where the weekly runs go:** the workflow saves each run on the branch `airport-runs` (`results.json` and a README), never on `main`. The Lab page reads that branch and falls back to this copy. This copy changes only when someone commits a run here.
- **Retrieved:** the two runs in this copy are from 2026-10-29. The raw CSVs are not stored; only each run's check results are.
- **Runs in this copy:** one real run, and one run marked `deliberate: true` in which the column `iso_country` was renamed in memory to rehearse an upstream break. Upstream was not changed.
- **Fields per run:** run date, status, row and column counts, upstream `Last-Modified` and its age, and for each of 19 checks: rows checked, rows failing, tolerance, up to three examples. Runs made after 2026-10-29 also keep, per file, the HTTP status, `Last-Modified`, size and timings (`files`), and the time the checks took (`checkMs`).
