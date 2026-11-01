---
title: "Flight reliability: what an average delay hides"
type: "research study"
lane: "data engineering"
status: "live"
question: "Did US domestic flights get more reliable in 2026, and does the average arrival delay give the right answer?"
payer: "An airline or airport operations team, or an analyst who reports on-time performance, that needs a reliability measure cancellations cannot hide behind."
dataSource: "US Bureau of Transportation Statistics, Reporting Carrier On-Time Performance (1987-present): 20 monthly archives from https://transtats.bts.gov/PREZIP/, January 2025 to August 2026"
dataLicence: "Public US federal flight records. The Data.gov record https://catalog.data.gov/dataset/bts-flight-data gives https://www.usa.gov/government-works as its licence. No Creative Commons licence is claimed."
dataFreshness: 2026-10-30
synthetic: false
limits: "Reported US domestic flights only, counted per flight, not per passenger. It shows what changed, not why, and blames no airport or airline. One full year of seasons. The fall in on-time arrivals is within normal repeat-period variation. A fixed snapshot, not refreshed."
runningCost: "US$0 a month. A fixed snapshot: the page reads saved files. No scheduled job and no paid service."
builtBy: "https://github.com/felipealves7/felipealveslab/pull/27"
published: 2026-11-01
---

## The question

Did US domestic flights get more reliable in 2026? The usual answer is the average arrival delay, and it barely moved. An airline or airport operations team, or anyone who reports on-time performance, would pay to know when that average is hiding something.

## The live piece

The month-by-month chart above. Pick a measure, compare January to August 2026 with 2025, and hover or tab through the months for both years' values. "Show the numbers" under each chart lists the same values as a table. Every value is worked out from the saved monthly totals when this site is built. No service runs behind it. Further down, the same data can also be loaded as a Tableau dashboard, if you choose.

## Method and results

**Data.** Twenty monthly archives of the BTS Reporting Carrier On-Time Performance table, January 2025 to August 2026, downloaded on 30 October 2026 from the [official archive](https://transtats.bts.gov/PREZIP/). The [field list](https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FGJ) still showed August 2026 as the latest month on 1 November 2026. In total 11,730,351 scheduled flights, every row kept, none sampled.

**Measures.** On time means less than 15 minutes late. A flight counts as arrived only if it was neither cancelled nor diverted and has an arrival delay. Every rate is a sum divided by a sum, never an average of rates. The comparison uses January to August of each year, the months both years have.

**Results, January to August.**

| Measure | 2025 | 2026 |
| --- | ---: | ---: |
| Scheduled flights | 4,680,482 | 4,728,732 |
| Average arrival delay | 9.33 min | 9.33 min |
| Average minutes late, early counted as zero | 17.98 min | 18.46 min |
| On-time arrival rate | 77.09% | 76.44% |
| On time, out of all scheduled flights | 75.64% | 74.50% |
| Cancellation rate | 1.57% | 2.20% |

The average delay stayed flat because early arrivals count as negative minutes and offset the late ones. Counting early arrivals as zero, the average went up. Cancellations rose by two fifths, and fewer of all scheduled flights arrived on time.

**Traffic mix.** Part of the fall in on-time arrivals comes from a different mix of routes, airlines and times of day. The network-wide fall is 0.65 points. On the 77,646 groups of route, airline, time of day and month seen in both years with at least 20 arrivals each, it is 0.37 points as measured and 0.36 points with the mix held fixed. Those groups cover 73% of each year's arrivals. With a threshold of 5 arrivals the fixed-mix fall is 0.49 points, on 83% of arrivals; with 50 it is 0.15 points, on 31%.

**Uncertainty.** A seven-day block bootstrap of the network's daily results, 2,000 repetitions, puts the repeat-period range of the change in on-time arrivals at −3.15 to +1.74 points. The range includes zero, so these 20 months do not show a lasting decline in on-time performance. The counts themselves are what carriers reported, not a sample.

**Pipeline and tests.** Python downloads and reads the archives; dbt builds the tables on DuckDB. 9 models, 92 data tests passed, and 8 Python tests passed. A separate run showed that reloading a month replaces changed, deleted and new rows and matches a clean rebuild. The monthly table matches the counts taken straight from the original CSV files in all 180 comparisons, 9 measures for each of 20 months. This site checks that again on every build, and the build stops if a single count differs.

**What failed along the way.**

- BTS airport ID 14027 carries two codes in this extract, PBI and DJT. Grouping by code would split one airport in two. The pipeline groups by the stable BTS ID and keeps the reported codes.
- The first monthly reload appended rows instead of replacing them. It now deletes a month before loading it, and fails if no month is named.
- One 2025 flight was neither cancelled nor diverted but has no arrival delay. It stays in the scheduled counts and its delay is not guessed.
- Departures scheduled at 2400 needed an explicit rule. They go in the midnight band.
- Loading the 30 MB airline-level file into Tableau Public lost the connection. A 7.8 MB route-by-month file, which keeps every flight in its totals, loaded. Airline and time of day cannot be explored in that dashboard.

## Known limits and running cost

- **Reported US domestic flights only.** Coverage follows BTS reporting rules; not every US flight is in the table. Counted per flight, not per passenger, and connections are not followed.
- **What, not why.** The data shows that cancellations rose and on-time success fell. It does not show why, and it ranks no airport or airline. "Airport" means where a flight departed, not who caused a delay.
- **One full year of seasons.** 2025 is the only complete year here, so seasonal patterns are described, not established.
- **The fall in on-time arrivals is within normal variation.** See the uncertainty range above.
- **A fixed snapshot.** BTS can revise past months. The SHA-256 of every archive is in `data/aviation-reliability/source-manifest.json`; a refresh would replace whole months.
- **Not rebuilt here.** This site does not rerun the pipeline. It recomputes every figure from the saved monthly table and checks that table against the independent counts.
- **Tableau and Kaggle are extras.** This page does not depend on them. When checked signed out on 1 November 2026, the Tableau dashboard (revision 1.4, republished that day) and the Kaggle notebook and dataset were public. In that check, four of the dashboard's states matched the project's data and September 2026 showed no data; its own year, month and airport controls were not clicked. Loading the dashboard on this page asks public.tableau.com for it, so it happens only when you click.
- **Cost:** US$0 a month. Saved files, no scheduled job, no paid service.

## How it was built

- Analysis and pipeline: a standalone project outside this repository, package `aviation-reliability-v1` of 30 October 2026. Python download and ingest, dbt models on DuckDB, a Python notebook and a Tableau Public draft. Its files, code included, are public as a Kaggle dataset; the cells above are exact copies of them.
- This page: pull request https://github.com/felipealves7/felipealveslab/pull/27
- Saved files: `data/aviation-reliability/`, copied byte for byte from the package, with SHA-256 in its README. Code: `src/lib/aviation/` and `src/components/Aviation*.astro`. Tests: `scripts/aviation-page.test.mjs`, which pins every figure on this page to the saved files.
- On other platforms, checked signed out on 1 November 2026: the [dashboard on Tableau Public](https://public.tableau.com/app/profile/felipealves7/viz/BTSFlightReliability/Flightreliability), the [notebook on Kaggle](https://www.kaggle.com/code/felipealves7/aviation-reliability-what-average-delay-hides) and the [dataset on Kaggle](https://www.kaggle.com/datasets/felipealves7/aviation-reliability-bts-foundation-v1). The record of that check, with the figures read off the dashboard, is `data/aviation-reliability/external.json`.

## My take
