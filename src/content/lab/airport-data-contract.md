---
title: "Airport data with a written contract"
type: "production-like demo"
lane: "data engineering"
status: "live"
question: "Can a small weekly pipeline load a public, community-edited dataset, reject bad rows through a written data contract, and say plainly when the data went stale or changed shape?"
payer: "A finance or operations team that depends on a public reference table, such as airport codes and countries, and needs to know before a report breaks when the table changes shape or goes stale."
dataSource: "OurAirports open data (airports, runways, countries), https://ourairports.com/data/"
dataLicence: "Public Domain, per https://ourairports.com/data/ (no guarantee of accuracy). Repository licence: Unlicense."
dataFreshness: 2026-10-29
synthetic: false
limits: "One real run and one rehearsed break. No history of weekly runs yet, no scheduled job in this version, and the tools differ from the plan: plain Node, not dlt, dbt and DuckDB."
runningCost: "US$0 a month. The page reads one saved file; the weekly download is one small HTTP fetch."
builtBy: "https://github.com/felipealves7/felipealveslab/pull/9"
published: 2026-10-29
---

## The question

Can a small weekly pipeline load a public, community-edited dataset, reject bad rows through a written contract, and say plainly when the data went stale or changed shape? A finance or operations team that depends on a public reference table, such as airport codes and countries, would pay to learn about a change before a report breaks.

## The live piece

The saved runs are below. The badge is worked out in your browser from the date of the last successful run. Pick a run to see each check, how many rows failed it and an example. The second run is a rehearsal: I renamed one column in memory to see what the contract says. Nothing is fetched live; the page reads one saved file.

<div id="airport-demo" class="ledger-demo" data-src="/data/airport-contract/results.json"><p>This piece needs JavaScript to load the saved runs. The full output is in <code>data/airport-contract/results.json</code> in the repository.</p></div>

## Method and results

**Data.** Three tables from OurAirports: airports (86,301 rows), runways (48,382) and countries (249), downloaded on 2026-10-29. The data page says the files are updated every night and are released to the Public Domain with no guarantee of accuracy. Edits are made by volunteers.

**The contract has 19 checks.** Six are file-level: each table must have the columns the pipeline reads, and a row count inside written bounds. Thirteen are row-level, for example: `id` is an integer and appears once; `type` is one of seven listed values; latitude and longitude are in range; `iso_country` exists in the countries table; each runway points to a real airport. A row that fails is counted and not trusted. A file-level failure fails the run. A row-level check fails the run when its rejected share goes over its tolerance, which is 0% for most checks and 0.1% for two.

**Freshness.** The pipeline reads the `Last-Modified` header of the upstream files. A run fails when that date is more than 7 days before the run. The badge above is a second, separate test: it fails when the last successful run is more than 8 days old.

**Results of the real run (2026-10-29).** The run passed. The upstream files were about 0.2 days old. One check found something: 6 of 48,382 runways have a length of 0 ft, which the contract treats as bad. That is 0.012%, under the 0.1% tolerance, so the run passed with those rows counted. Every other check found nothing.

**The rehearsed break.** I renamed `iso_country` to `country_code` in the airports table, in memory only. Upstream was not changed. The run failed with 3 of 19 checks red:
- `airports.columns` said `missing column iso_country`. This is the useful message.
- `airports.country_known` failed for all 86,301 rows. Correct, but it only repeats the first message.
- `airports.region_matches_country` also failed for all 86,301 rows, because it reads the same column. A reader sees three red checks for one cause.

**What this does not show.** The upstream data was clean on the day I looked, so the contract found one small thing. The risk the proposal named was real. I did not replay the upstream git history to look for past schema changes, so I cannot say how often the real files break.

**How to rerun.**
- `node pipelines/airport-contract/run.mjs` downloads the files, checks them and appends one run to `data/airport-contract/results.json`.
- `node pipelines/airport-contract/run.mjs --rename airports.iso_country=country_code` repeats the rehearsal.
- `node --test pipelines/airport-contract/contract.test.mjs` runs the 8 tests.

## Known limits and running cost

- **Not the planned tools.** The proposal named dlt, DuckDB and dbt-core. This version is plain Node with no dependencies, to match the rest of the repository and run on the existing CI. It teaches the contract and freshness ideas, not those tools. I did not test them.
- **No schedule yet.** A weekly job needs a workflow file under `.github/`, which is a governance path. It is not in this pull request, so the badge will go stale until someone adds one or refreshes the file by hand.
- **Two runs only.** One real, one rehearsed. A trend needs weeks of runs.
- **Tolerances and bounds were set after looking at the first real run.** That makes the first pass less informative than it looks.
- **Freshness is the file date, not the truth.** A file can be new and still wrong.
- **Contract coverage.** It checks shape, ranges and links between tables. It cannot tell whether an airport name or a coordinate is correct.
- **Cost:** US$0 a month. No server, one small fetch a week once scheduled.

## How it was built

- Pull request: https://github.com/felipealves7/felipealveslab/pull/9
- Code: `pipelines/airport-contract/`. Saved output: `data/airport-contract/`. Tests: `pipelines/airport-contract/contract.test.mjs`.

## My take

