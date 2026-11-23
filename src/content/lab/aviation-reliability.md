---
title: "Flight reliability: what an average delay hides"
type: "research study"
lane: "data engineering"
status: "live"
question: "Did US domestic flights get more reliable in 2026, and does the average arrival delay give the right answer?"
payer: "An airline or airport operations team, or an analyst who reports on-time performance, that needs a reliability measure cancellations cannot hide behind."
dataSource: "US Bureau of Transportation Statistics, Reporting Carrier On-Time Performance (1987-present): 20 monthly archives from https://transtats.bts.gov/PREZIP/, January 2025 to August 2026; the shutdown test re-reads September to November 2025 from the same archive, downloaded on 22 November 2026"
dataLicence: "Public US federal flight records. The Data.gov record https://catalog.data.gov/dataset/bts-flight-data gives https://www.usa.gov/government-works as its licence. No Creative Commons licence is claimed."
dataFreshness: 2026-10-30
synthetic: false
limits: "Reported US domestic flights only, counted per flight, not per passenger. It shows what changed, not why, and blames no airport or airline. One full year of seasons. The fall in on-time arrivals is within normal repeat-period variation. A fixed snapshot, not refreshed. The shutdown test compares groups of routes; it cannot separate the FAA order from the controller shortages and weather of the same days."
runningCost: "US$0 a month. A fixed snapshot: the page reads saved files. No scheduled job and no paid service."
builtBy: "https://github.com/felipealves7/felipealveslab/pull/27"
published: 2026-11-01
---

## The question

Did US domestic flights get more reliable in 2026? The usual answer is the average arrival delay, and it barely moved. An airline or airport operations team, or anyone who reports on-time performance, would pay to know when that average is hiding something.

## The live piece

The month-by-month chart above. Pick a measure, compare January to August 2026 with 2025, and hover or tab through the months for both years' values. "Show the numbers" under each chart lists the same values as a table. Every value is worked out from the saved monthly totals when this site is built. No service runs behind it. Further down, on wide screens, the same data loads as a Tableau dashboard as you reach it.

## Method and results

**Data.** Twenty monthly archives of the BTS Reporting Carrier On-Time Performance table, January 2025 to August 2026, downloaded on 30 October 2026 from the [official archive](https://transtats.bts.gov/PREZIP/). The [field list](https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FGJ) still showed August 2026 as the latest month on 1 November 2026. In total 11,730,351 scheduled flights, every row kept, none sampled.

**Measures.** On time means less than 15 minutes late. A flight counts as arrived only if it was neither cancelled nor diverted and has an arrival delay. Every rate is a sum divided by a sum, never an average of rates. The comparison uses January to August of each year, the months both years have.

**Results, January to August.**

| Measure | 2025 | 2026 |
| --- | --- | --- |
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

**Data issues found and fixed.**

- BTS airport ID 14027 carries two codes in this extract, PBI and DJT. Grouping by code would split one airport in two. The pipeline groups by the stable BTS ID and keeps the reported codes.
- The first monthly reload appended rows instead of replacing them. It now deletes a month before loading it, and fails if no month is named.
- One 2025 flight was neither cancelled nor diverted but has no arrival delay. It stays in the scheduled counts and its delay is not guessed.
- Departures scheduled at 2400 needed an explicit rule. They go in the midnight band.
- Loading the 30 MB airline-level file into Tableau Public lost the connection. A 7.8 MB route-by-month file, which keeps every flight in its totals, loaded. Airline and time of day cannot be explored in that dashboard.

### The shutdown test, November 2025

**The shock.** During the 2025 federal government shutdown, the FAA ordered airlines to cut scheduled domestic flights at 40 busy airports from 7 November ([the order and its airport list](https://www.govinfo.gov/content/pkg/FR-2025-11-12/html/2025-19850.htm)). As applied, the cut was 4% from 7 November and 6% from 11 November, and went no higher ([PBS, 14 November 2025](https://www.pbs.org/newshour/nation/faa-eases-commercial-flight-restrictions-after-shutdown-strain-but-some-limits-remain)). It was 3% on 15 and 16 November and was lifted at 6 a.m. EST on 17 November ([CBS](https://www.cbsnews.com/amp/texas/news/faa-lifts-emergency-order-slashing-flights)). Flights between two airports off the list were outside the order, so they are the comparison.

**Data.** The same BTS table, re-read for 1 September to 30 November 2025 on 22 November 2026: 1,738,833 scheduled flights. Each flight is grouped by whether a listed airport is at both ends, one end or neither.

**Cancellation rate, cancelled out of scheduled flights.**

| Flights | Shutdown, before the order (1 Oct to 6 Nov) | Order in force (7 to 16 Nov) | After the order (17 to 30 Nov) |
| --- | --- | --- | --- |
| Listed airport at both ends | 0.62% (1,821 of 291,953) | 5.62% (4,370 of 77,787) | 1.25% (1,368 of 109,152) |
| Listed airport at one end | 0.45% (1,793 of 395,285) | 4.99% (5,237 of 104,975) | 1.77% (2,613 of 147,523) |
| No listed airport | 0.26% (79 of 29,944) | 0.37% (29 of 7,896) | 0.75% (89 of 11,879) |

- **The cuts landed where the order applied.** From the shutdown weeks to the order days, the cancellation rate rose 4.99 points on routes with a listed airport at both ends and 4.54 points at one end, against 0.10 points on routes with neither: differences of 4.89 and 4.43 points.
- **Most were coded to the air traffic system.** During the order, 72.99% of cancellations carried the National Aviation System code, against 31.49% in the shutdown weeks before it.
- **They appear as cancellations, not as missing flights.** Scheduled flights on the order days were 0.95% (both ends) and 1.32% (one end) below the same weekdays in the four weeks before. BTS counts a flight as cancelled when it was still listed in the airline's reservation system in the seven days before departure ([BTS glossary](https://transtats.bts.gov/Glossary.asp?v0qrA=P)), and the order gave one day's notice.
- **The average delay hides most of it.** Across all flights, the cancellation rate went from 0.51% to 5.05%, almost ten times, while the average arrival delay of the flights that landed went from 5.37 to 7.72 minutes.
- **The level of detail decides what you see.** Taken as a month, November 2025 cancelled 2.49% of flights (14,195 of 570,550). Taken by day, 9 November cancelled 12.13% (2,480 of 20,442).
- **The size of the cut did not set the size of the damage.** On flights touching a listed airport, 8.76% were cancelled on the 4% days, 3.87% on the 6% days and 0.84% on the 3% days. The three worst days, 8 to 10 November, all fell in the 4% step.

**Code and tests.** `pipelines/aviation-shutdown/` downloads the three archives, totals each day by exposure group and by origin airport, and computes these results. Its tests check the counting rules, the analysis on made-up days, that both daily files count every flight once, and that `data/aviation-shutdown/results.json` is what the code computes. `scripts/aviation-shutdown-page.test.mjs` pins every figure in this section to that file.

## Known limits and running cost

- **Reported US domestic flights only.** Coverage follows BTS reporting rules; not every US flight is in the table. Counted per flight, not per passenger, and connections are not followed.
- **What, not why.** The data shows that cancellations rose and on-time success fell. It does not show why, and it ranks no airport or airline. "Airport" means where a flight departed, not who caused a delay.
- **One full year of seasons.** 2025 is the only complete year here, so seasonal patterns are described, not established.
- **The fall in on-time arrivals is within normal variation.** See the uncertainty range above.
- **The shutdown test compares groups of routes.** It cannot separate the FAA order from the controller shortages and weather of the same days. Routes between two unlisted airports are few: 7,896 flights over the ten order days.
- **A fixed snapshot.** BTS can revise past months. The SHA-256 of every archive is in `data/aviation-reliability/source-manifest.json`; a refresh would replace whole months.
- **Not rebuilt here.** This site does not rerun the pipeline. It recomputes every figure from the saved monthly table and checks that table against the independent counts.
- **Tableau and Kaggle are extras.** This page does not depend on them. When checked signed out on 1 November 2026, the Tableau dashboard (revision 1.4, republished that day) and the Kaggle notebook and dataset were public. In that check, four of the dashboard's states matched the project's data and September 2026 showed no data; its own year, month and airport controls were not clicked. Loading the dashboard on this page asks public.tableau.com for it, so it happens only when you click.
- **Cost:** US$0 a month. Saved files, no scheduled job, no paid service.

## How it was built

- Analysis and pipeline: a standalone project outside this repository, package `aviation-reliability-v1` of 30 October 2026. Python download and ingest, dbt models on DuckDB, a Python notebook and a Tableau Public draft. Its files, code included, are public as a Kaggle dataset; the cells above are exact copies of them.
- This page: pull request https://github.com/felipealves7/felipealveslab/pull/27
- The shutdown test: pull request https://github.com/felipealves7/felipealveslab/pull/76. Pipeline `pipelines/aviation-shutdown/`, saved files `data/aviation-shutdown/`, built and tested in this repository.
- Saved files: `data/aviation-reliability/`, copied byte for byte from the package, with SHA-256 in its README. Code: `src/lib/aviation/` and `src/components/Aviation*.astro`. Tests: `scripts/aviation-page.test.mjs`, which pins every figure on this page to the saved files.
- On other platforms, checked signed out on 1 November 2026: the [dashboard on Tableau Public](https://public.tableau.com/app/profile/felipealves7/viz/BTSFlightReliability/Flightreliability), the [notebook on Kaggle](https://www.kaggle.com/code/felipealves7/aviation-reliability-what-average-delay-hides) and the [dataset on Kaggle](https://www.kaggle.com/datasets/felipealves7/aviation-reliability-bts-foundation-v1). The record of that check, with the figures read off the dashboard, is `data/aviation-reliability/external.json`.
