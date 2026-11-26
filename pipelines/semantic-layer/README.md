# semantic-layer

The Lab's governed metrics: one dbt project whose models carry the metric definitions, read by
[MetricFlow](https://github.com/dbt-labs/metricflow) (Apache 2.0 from version 0.209.0) on DuckDB.
Questions reach it as names (metrics, groupings, a month range, filters), never as SQL;
MetricFlow writes the SQL from the definitions and returns it with the rows.

## What is in it

- `models/ledger/`: the synthetic Ask the Ledger data as a fact table with its semantic model, and
  the six metrics of `pipelines/ask-the-ledger/semantic.mjs`. Revenue, cost of sales and operating
  expenses are simple metrics; gross profit, operating profit and gross margin are derived ones,
  summed first and combined after, at whatever grain a question asks for.
- `models/calendar/dim_date.sql`: one row per day from 2020 to 2030. MetricFlow's time spine, and
  the calendar every later lab joins its dates to.
- `build_ledger.py`: writes the ledger to Parquet from `pipelines/ledger-api/schema.sql` and
  `seed.sql`, the same rows the live D1 table holds.
- `semantic_query.py`: queries by name in the same process. Unknown metrics, groupings and values
  are refused with the list of valid ones; each answer carries its definitions and its SQL.
- `export_cases.mjs`: every Ask the Ledger benchmark case with its expected answer, computed from
  raw account names by the suites' own code, as JSON.

## Run

```
pip install -r pipelines/semantic-layer/requirements.txt
python -m unittest discover -s pipelines/semantic-layer
cd pipelines/semantic-layer && DBT_PROFILES_DIR=. mf query --metrics gross_margin \
  --group-by ledger_line__company --start-time 2025-01-01 --end-time 2025-12-31
```

The tests build everything into `target/` (not committed), then check that:

- the Parquet file holds exactly the 1,008 rows the generator makes;
- all 44 scoped cases (34 from legacy47, 10 from validation20) give the gold answer;
- a margin is computed from sums, not averaged from smaller margins;
- unknown names and values are refused, and answers carry their definitions and SQL.

dbt adds 9 data tests of its own (unique and not-null keys, accepted account groups).

## Limits

- The ledger is one table, so this model has no joins yet; they arrive with the first joined lab.
- MetricFlow runs in Python. The live Ask the Ledger box keeps its own SQL path; this layer serves
  the benchmark in `pipelines/ask-benchmark` first.
- Versions are pinned in `requirements.txt` so CI and the benchmark run the same engine.
