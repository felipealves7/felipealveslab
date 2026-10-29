---
title: "Airport data with a written contract"
type: "production-like demo"
lane: "data engineering"
status: "live"
question: "Can a small weekly pipeline load a public dataset it does not control, reject bad rows through a written data contract, and say plainly when the data went stale or changed shape?"
payer: "A finance or operations team that depends on a public reference table, such as airport codes and countries, and needs to know before a report breaks when the table changes shape or goes stale."
dataSource: "OurAirports open data (airports, runways, countries), https://ourairports.com/data/"
dataLicence: "Public Domain, per https://ourairports.com/data/ (no guarantee of accuracy). Repository licence: Unlicense."
dataFreshness: 2026-10-29
synthetic: false
limits: "It checks shape, ranges and links between files, not whether a name or coordinate is right. One real run and one rehearsal were saved before the weekly job started. Tolerances were set after looking at the first real run. Plain Node, not dlt, dbt and DuckDB."
runningCost: "US$0 a month. One weekly job on GitHub's standard runners, free for public repositories; the page reads saved files."
builtBy: "https://github.com/felipealves7/felipealveslab/pull/11"
published: 2026-10-29
---

## The question

Can a small weekly pipeline load a public dataset it does not control, reject bad rows through a written contract, and say plainly when the data went stale or changed shape? A finance or operations team that relies on a public reference table, such as airport codes and countries, would pay to hear about a change before a report breaks.

## The live piece

Replay a saved run step by step: where the data comes from, how it is fetched and parsed, the rules as written, and the gate that passes or fails the run. Each step shows the code that runs, read from the pipeline files when the site is built. Then run the same code on today's files in your browser, break a copy on purpose, and watch the gate turn red.

<div id="airport-replay" class="airport-replay"><p>The replay needs JavaScript. The saved runs are in <code>data/airport-contract/results.json</code> and the code is in <code>pipelines/airport-contract/</code>.</p></div>

## Method and results

**Data.** Three files from [OurAirports](https://ourairports.com/data/): airports, runways and countries. They are downloaded from `davidmegginson.github.io/ourairports-data`, the published copy of the [ourairports-data repository](https://github.com/davidmegginson/ourairports-data). The data page says the files are updated every night and released to the Public Domain, with no guarantee of accuracy.

**The contract has 19 rules.** Six look at whole files: each file must have the columns the pipeline reads, and a row count inside written bounds. Thirteen look at every row: for example, `id` is an integer and appears once, latitude and longitude are in range, `iso_country` exists in the countries table, and each runway points to a real airport. A bad row is counted and not trusted. A row rule fails the run only when its share of bad rows goes over its tolerance: none for eleven rules, 0.1% for two.

**Freshness.** The pipeline reads the `Last-Modified` header of each file and keeps the oldest. A run fails when that date is more than 7 days before the run. The badge at the top of this page is a second, separate test, worked out in your browser: it turns stale when the last passed run is more than 8 days old, so it shows when the weekly job stops.

**Results.**

- **First real run, 29 Oct 2026: passed.** This is the run saved with the page, before the weekly job started. Later runs come from the weekly job and appear in the replay above, so the figures here can differ from the latest run. The files were 0.2 days old. One rule found something: 6 of 48,382 runways have a length of 0 ft. That is 0.012%, under the 0.1% allowed, so the run passed with those rows counted. Every other rule found nothing.
- **Rehearsed break, same day: failed, for one reason.** I renamed `iso_country` to `country_code` in memory; upstream was not changed. Three rules went red, but two of them only read the missing column. The page now reports one cause, "The airports file has no iso_country column", with the two rules listed under it. The first version of this page showed three separate red checks.

**What changed in this version.**

- The page leads with the latest result and replays each run step by step, next to its code.
- The download and the run record moved into modules a browser can run, so "Run it yourself" uses the same code as the weekly job.
- Seven rehearsed breaks, from a renamed column to a file cut short. Tests check that each break fails exactly the rules it should.
- A weekly job on GitHub Actions runs the pipeline every Monday at 03:17 UTC, and after each change to the pipeline. It saves every run, passed or failed, on the `airport-runs` branch. This page reads that branch, and falls back to the copy saved with the page.

**Tests.** 33 tests: 20 for the pipeline and the breaks, 13 for the figures and sentences on this page, pinned to the saved runs.

**How to rerun.**

- `node pipelines/airport-contract/run.mjs` downloads the files, checks them and appends one run to `data/airport-contract/results.json`.
- `node pipelines/airport-contract/run.mjs --rename airports.iso_country=country_code` repeats the rehearsal.
- `node --test "pipelines/airport-contract/*.test.mjs" scripts/airport-page.test.mjs` runs the tests.

## Known limits and running cost

- **It checks shape, not truth.** Columns, ranges, codes and links between files. It cannot tell whether an airport's name or coordinates are right.
- **Few runs so far.** One real run and one rehearsal were saved before the weekly job started. A trend needs months of Mondays.
- **Tolerances and row bounds were set after looking at the first real run.** That makes the first pass less informative than it looks.
- **Freshness is the file date, not the truth.** A file can be new and still wrong.
- **The weekly job needs GitHub to keep it switched on.** GitHub [disables scheduled workflows in a public repository](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/disabling-and-enabling-a-workflow) after 60 days with no repository activity. Its documentation does not say what counts as activity, and I did not test whether the job's own saves count. If the job stops, the badge at the top turns stale after 8 days.
- **A failed download is not saved as a run.** The job shows red on GitHub and the badge goes stale after 8 days, but the page does not list the failed attempt.
- **"Run it yourself" downloads the full files into your browser** and parses them there. The page can pause for a second or two, and a phone may run short of memory.
- **Not the tools named in the first proposal.** This is plain Node with no dependencies, not dlt, DuckDB and dbt.
- **Cost:** US$0 a month. The weekly job runs on GitHub's standard runners, which are [free for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions). The page reads saved files from GitHub and from this site.

## How it was built

- First version: pull request https://github.com/felipealves7/felipealveslab/pull/11
- This version (result-first page, replay, weekly job): pull request https://github.com/felipealves7/felipealveslab/pull/24
- Code: `pipelines/airport-contract/` and `src/lib/airport/`. Saved runs: `data/airport-contract/`, and the `airport-runs` branch for the weekly runs. Tests: `pipelines/airport-contract/*.test.mjs` and `scripts/airport-page.test.mjs`.

## My take

