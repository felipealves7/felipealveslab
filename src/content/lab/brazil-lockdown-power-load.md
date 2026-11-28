---
title: "Which demands bend? Brazil's power load in the 2020 lockdowns"
type: "research study"
lane: "data engineering"
status: "building"
question: "When Brazil's states locked down in March 2020, how much did power use fall, did the states that locked down harder cut more, and how does the answer change between hours, days, months and quarters?"
payer: "Grid operators and energy traders who plan for demand shocks, distribution companies and the regulator weighing tariff relief after one, and economists and investors who read power load as a real-time measure of activity."
dataSource: "ONS hourly load by subsystem (Curva de Carga Horária, 2018 to 2021) and ONS substation and transformer tables, https://dados.ons.org.br/dataset/curva-carga; Oxford COVID-19 Government Response Tracker, Brazil's 27 states, https://github.com/OxCGRT/covid-policy-dataset; Banco Central do Brasil IBC-Br, series 24363 and 24364. Downloaded 28 Nov 2026."
dataLicence: "ONS: Creative Commons Attribution, as stated on each dataset page. OxCGRT: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). IBC-Br: Open Data Commons Open Database License (ODbL), as stated on the BCB open data page."
dataFreshness: 2026-11-28
synthetic: false
limits: "Four subsystems carry the whole cross-sectional comparison, and after weighting their stringency differed by 6.1 points on an average day, so the same-day estimate cannot tell a dose effect from zero. Weather is not modelled. The bridge weights use transformer capacity as a stand-in for each state's load. Months and quarters are calendar periods, not weekday-aligned."
runningCost: "US$0 a month. No scheduled job and no live service; the page and the embedded dbt docs are files served with this site."
builtBy: "https://github.com/felipealves7/felipealveslab/pull/88"
published: 2026-11-28
---

## The question

When Brazil's states locked down in March 2020, how much did power use fall, did the states that locked down harder cut more, and how does the answer change between hours, days, months and quarters? Grid operators and energy traders who plan for demand shocks would pay for the answer, as would distribution companies and the regulator weighing tariff relief after one, and economists and investors who read power load as a real-time measure of activity.

## The live piece

### The model behind every figure: dbt docs

<figure class="power-docs">
<iframe class="power-docs-live" src="/lab-docs/semantic-layer/index.html#!/model/model.lab_semantic_layer.fct_load_vs_reference" title="dbt docs for the Lab's semantic layer: models, tests, lineage and metrics" loading="lazy"></iframe>
<img class="power-docs-still" src="/assets/lab/power-lockdown-lineage.png" alt="Lineage graph from the dbt docs: ONS hourly load and the lab calendar feed fct_load_daily and fct_load_vs_reference, which feed the load metrics; the OxCGRT stringency and the state-to-subsystem bridge feed fct_stringency_subsystem_daily, which feeds the two stringency metrics and the two bridge tests." width="2256" height="360" loading="lazy">
<figcaption>The dbt docs load from this site as you reach them: every model, column, test and metric, with the lineage from the raw files to the governed metrics (lineage button, bottom right). Phones and readers without the embed get the still above, taken from the same docs. <a href="/lab-docs/semantic-layer/index.html">Open the dbt docs</a>.</figcaption>
</figure>

### The one chart

Each subsystem's daily load against the same weekdays of 2018 and 2019, and its lockdown stringency underneath. Everything is read from `data/power-lockdown/results.json`, saved with the page.

<div data-lab-chart="power"></div>

## Method and results

### Result

- **How much power use fell depends on the level of detail you measure it at.** Brazil's load (the four subsystems summed) against the same weekdays and months of 2018 and 2019, from the state decrees to the end of June 2020:

| Level of detail | Deepest fall, 16 Mar to 30 Jun 2020 | When | Out of |
| --- | --- | --- | --- |
| Hour | −19.87% | 9 Apr 2020, 11:00 | 2,064 comparable hours |
| Day | −14.14% | 9 Apr 2020 | 86 comparable days |
| ISO week | −12.79% | 20 to 26 Apr 2020 (5 comparable days) | 11 weeks with at least 5 comparable days |
| Calendar month | −11.63% | April 2020 | 4 months, March to June |
| Calendar quarter | −8.21% | Q2 2020 | 1 quarter |
| The whole period | −6.88% | 16 Mar to 30 Jun 2020 | 86 comparable days |

- **Activity fell further than power at the month level.** The IBC-Br activity index (series 24363, not seasonally adjusted) was 13.93% below the mean of April 2018 and April 2019 in April 2020, against 11.63% for load. For Q2 2020, the mean of its three months, IBC-Br was 10.59% lower and load 8.21% lower. The seasonally adjusted series (24364) fell 15.13% from February to April 2020.
- **The subsystems that locked down harder did not cut more.** In April 2020 the Southeast/Centre-West had the second-lowest weighted stringency (81.6) and the largest fall (−12.27%). The South had the highest stringency (86.0) and the second-largest fall (−10.75%). The North had the lowest capacity-weighted stringency (80.6) and the smallest fall (−7.96%).

| Subsystem, April 2020 | Weighted stringency (capacity) | Weighted stringency (equal) | Load against 2018–19 | Comparable days |
| --- | --- | --- | --- | --- |
| North | 80.6 | 84.1 | −7.96% | 19 |
| Northeast | 83.4 | 83.9 | −9.96% | 19 |
| South | 86.0 | 86.1 | −10.75% | 19 |
| Southeast/Centre-West | 81.6 | 81.6 | −12.27% | 19 |

- **The dose estimate.** Change in load per 10 points of weighted stringency, with a 95% interval from 2,000 bootstrap draws of whole ISO weeks:

| Comparison | Days | Capacity weights | Equal weights |
| --- | --- | --- | --- |
| Each subsystem against itself, 6 Jan to 30 Jun 2020 | 147 | −1.08% (−1.35% to −0.81%) | −1.06% (−1.32% to −0.79%) |
| Subsystems against each other on the same day, 16 Mar to 30 Jun 2020 | 86 | −1.18% (−5.21% to 1.56%) | +1.78% (−5.34% to 5.35%) |

The first row moves with stringency over time, but national events on the same days (closures, fear, the fall in activity) move with it, so it is not a dose effect. The second row cancels everything common to a day and keeps only the differences between subsystems. Its interval includes zero under both weightings and its sign flips between them: on this data, harder lockdowns are not shown to have cut more load. This is the outcome the brief named in advance as the one that would disprove the dose idea.

- **Why the dose barely registers.** In April 2020 the states ranged from 70.4 (Federal District) to 94.4 (Roraima). Weighted into four subsystems, that spread shrinks: from 16 March to 30 June the strictest and the mildest subsystem were 6.1 points apart on an average day (capacity weights; 5.4 with equal weights), 12.2 at most. The geography is a level of detail too: states that differ by 24 points become subsystems that differ by 6.

### Data and checks

- **ONS hourly load** (`CURVA_CARGA_2018.csv` to `2021.csv`): 140,256 rows, one per subsystem and hour. The data dictionary settles that the file is split by subsystem: North, Northeast, South and Southeast/Centre-West, with values in MWmed, which for one hour is also MWh. Kept unchanged in `data/power-lockdown/raw/ons/` with their SHA-256 hashes.
- **OxCGRT** compact subnational file: Brazil's 27 federative units, 731 days each (2020 and 2021), `STATE_TOTAL` jurisdiction, the average stringency index (0 to 100). The 43 MB file is reduced to these rows; its own hash is recorded.
- **IBC-Br**, series 24363 and 24364, January 2017 to December 2021, from the BCB open API.
- **41 checks, all passed, tolerance zero:** columns, codes, whole hours, no negative or missing values, one row per subsystem and hour and all 24 hours of every day (each year's file); every state, every day and a valid index (OxCGRT); all 60 months (IBC-Br); each state in one subsystem, every subsystem covered, weights summing to one under both weightings and on every day; and Brazil's daily load equal to the sum of all hourly values, so no hour is counted twice. The 2018 file leaves the hour at 00:00 on 4 November empty in three subsystems and zero in the South: the night clocks went forward for daylight saving. Those 4 values are named in the check, and the day is left out.

### The calendar

Every day of 2020 is compared with the days 364 and 728 days earlier, which fall on the same weekday. A comparison is kept only if none of the three days is a national holiday, Christmas Eve or New Year's Eve, a Carnival day or Ash Wednesday, a day of the Easter weekend, Corpus Christi, or a bridge day (a Monday before a Tuesday holiday, a Friday after a Thursday one). That keeps 86 of the 107 days from 16 March to 30 June. Easter is computed; state and city holidays are not included.

### The bridge: states to subsystems

ONS publishes load by subsystem and OxCGRT publishes policy by state, so the two meet through a bridge. Each state belongs to the subsystem that holds most of its substations in ONS's operating network table (`SUBESTACAO`). Four states have substations in two subsystems and go to the larger side: Pará (72 North, 2 elsewhere), Tocantins (12 North, 5 elsewhere) and Paraná (111 South, 13 elsewhere) and Mato Grosso (62 Southeast/Centre-West, 1 elsewhere). Acre and Rondônia fall in the Southeast/Centre-West. Each state's weight is its share of its subsystem's basic-grid transformer capacity in service on 1 March 2020 (`CAPACIDADE_TRANSFORMACAO`), a stand-in for its share of load; the second weighting counts every state the same. São Paulo carries 50.5% of its subsystem's capacity weight, Bahia 35.6% of the Northeast's. The table is `data/power-lockdown/bridge.csv`.

### The estimate

For each subsystem and comparable day, y is the log of the day's load over the mean of its two reference days, less the subsystem's mean from 6 January to 13 March 2020, before the decrees. That removes each subsystem's own growth: in that period the South ran 4.76% above its 2018–19 days and the Southeast/Centre-West 1.53% below. y is regressed on weighted stringency over 10, with subsystem effects only, then with subsystem and day effects. The interval resamples whole ISO weeks, the same draws every run (seed 20200316).

### What others found

- An operator's article in CIGRE's Electra 312 (October 2020), by Brazil's coordinator for system operation and control, reports daily consumption down by up to 22.74%, Friday 17 April against Friday 13 March 2020; April demand in the Southeast/Midwest 15% below March; June more than 4% below typical 2019 values; and the daily peak in the evening, after 6 pm, from 20 March ([Electra](https://electra.cigre.org/312-october-2020/global-connections/how-the-covid-19-pandemic-contaminated-the-brazilian-electric-systems-operation)). It compares chosen days, so it reads deeper than any row above.
- Menezes, Figer, Jardim and Medeiros (UQ School of Economics Discussion Paper 641, 7 April 2021) built an indicator from ONS hourly load that fell 6.9% in the three and a half months after distancing began on 16 March 2020, with the sharpest fall, 14.61%, in April ([paper](https://economics.uq.edu.au/files/39731/641.pdf)). This page finds 6.88% over 16 March to 30 June with a different baseline and calendar.

### The same figures through the semantic layer

The metrics are defined once in dbt and read by MetricFlow on DuckDB (`pipelines/semantic-layer/models/power_lockdown/`). `load_change_pct` sums the compared load and the reference load first and divides after, so a month is never an average of daily changes. Asked through MetricFlow, it gives the same April figures by subsystem and the same −6.88% for the whole period as the Node pipeline, to the hundredth; the stringency means agree to the tenth.

### Tests

- 14 tests in `pipelines/power-lockdown/power.test.mjs`: the calendar (Easter, Carnival, bridge days, aligned reference days, ISO weeks), every load, policy and activity check on small made-up files, the clock-change hour, the OxCGRT extract, the bridge and its weights, renormalised stringency, the estimator on a panel with a known slope, and the real files: all 41 checks pass, the saved results and tables are exactly what the code makes, and every raw file matches its recorded hash.
- dbt: 33 data tests in the semantic layer's build, 22 of them on this lab's models, among them that the bridge weights sum to one for every subsystem and day, that every subsystem has a stringency value every day, and that no hour of load is counted twice between the hourly and daily tables.
- 4 tests in `pipelines/semantic-layer/test_power_lockdown.py` compare MetricFlow's answers with the Node results and check that the week, month and whole-period answers differ.
- `scripts/power-page.test.mjs` pins every figure on this page to the saved results.

### How to rerun

- `NODE_USE_ENV_PROXY=1 node pipelines/power-lockdown/fetch.mjs` downloads the sources again and records their hashes. A changed hash on an ONS file is a revision to look into.
- `node pipelines/power-lockdown/analyse.mjs` runs the checks and writes `data/power-lockdown/results.json` and the tables.
- `python pipelines/semantic-layer/build_docs.py` builds the dbt models and tests and writes the docs page.
- `node --test pipelines/power-lockdown/power.test.mjs scripts/power-page.test.mjs` and `python -m unittest discover -s pipelines/semantic-layer` run the tests.

## Known limits and running cost

- **Four units carry the cross-section.** The same-day estimate rests on four subsystems over 86 days, and their stringency was close. An interval that includes zero here means the data cannot show a dose effect, not that there was none.
- **Weather is not modelled.** Heat moves load, and March 2020 in the South ran well above its 2018–19 days before any decree. The pre-decree adjustment removes a level, not a season.
- **The bridge is a stand-in.** ONS does not publish load by state. Transformer capacity is a proxy for a state's share of load, and the result is shown under a second, equal weighting. Whether Roraima's load is in the North subsystem's 2020 figures was not verified; it carries 1.1% of the North's capacity weight.
- **Months and quarters are calendar periods,** set against the same months of 2018 and 2019 without weekday alignment, as monthly statistics are reported. Hours, days and weeks are weekday-aligned.
- **The deepest hour is the minimum of 2,064.** The lowest single value of many comparisons is partly chance; the table shows it to make the level-of-detail point, not as a typical hour.
- **IBC-Br is national and monthly.** It cannot be split by subsystem, so it is set beside the national load only.
- **ONS revises published values.** This page uses one download, 28 November 2026; its hashes are in `data/power-lockdown/sources.json`.
- **Still to come on this page:** Ask this lab, a question panel on these metrics with its own benchmark.
- **Cost:** US$0 a month. No scheduled job and no live service.

## How it was built

- Pull request: https://github.com/felipealves7/felipealveslab/pull/88. Brief: https://github.com/felipealves7/felipealveslab/issues/86
- Pipeline: `pipelines/power-lockdown/` in plain Node. Semantic layer: `pipelines/semantic-layer/models/power_lockdown/` in dbt with MetricFlow on DuckDB. Chart: `charts/power_lockdown.py` in Altair, drawn by `src/lib/charts/power.mjs`. Data and results: `data/power-lockdown/`.

Data: Operador Nacional do Sistema Elétrico (ONS), Curva de Carga Horária, Subestações and Capacidade de Transformação, Creative Commons Attribution. Oxford COVID-19 Government Response Tracker, Blavatnik School of Government, University of Oxford, CC BY 4.0. Banco Central do Brasil, IBC-Br, ODbL. Every comparison, weight and estimate computed by this Lab.
