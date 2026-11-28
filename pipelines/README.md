# pipelines/

Ingestion and transformation code, one folder per pipeline, with its tests next to it.
Scheduled refreshes run as GitHub Actions workflows; the agents step in when something is new or broken.

## ask-the-ledger

Synthetic ledger, a small semantic layer, a keyword translator, a hand-written test set and a scorer. Run `node pipelines/ask-the-ledger/evaluate.mjs` to rebuild `data/ask-the-ledger/results.json`. Tests: `node --test pipelines/ask-the-ledger/ledger.test.mjs`.

## airport-contract

Reads three public OurAirports tables, checks them against a written 19-check data contract and an upstream freshness limit, and appends one run to `data/airport-contract/results.json`. Run `node pipelines/airport-contract/run.mjs` (needs network). Tests: `node --test pipelines/airport-contract/contract.test.mjs`.

## ccee-pld

Checks CCEE's hourly PLD files in `data/ccee-pld-horario/` against a written 13-check data contract, saves a snapshot with a fingerprint per month, compares it with the previous snapshot to find restated or missing values, and writes `data/ccee-pld/results.json` for `/lab/brazil-power-price-contract`. No network: CCEE refuses automated downloads, so a refresh is a manual download, then `node pipelines/ccee-pld/run.mjs --retrieved YYYY-MM-DD`. Tests: `node --test pipelines/ccee-pld/pld.test.mjs`.

## ledger-api

Cloudflare Worker for the live box on Ask the Ledger: origin check, daily caps, model call, SQL validator, D1. Also the D1 `schema.sql` and `seed.sql`, a scorer for model-written SQL, and the recorded example session. Regenerate the SQL with `node pipelines/ledger-api/build-sql.mjs`. Tests: `node --test pipelines/ledger-api/ledger-api.test.mjs`. Setup for Felipe: run `schema.sql` then `seed.sql` in the D1 console, put the real D1 and KV ids in `wrangler.toml`, deploy the Worker, then set `data-api` on the `ledger-live` box in `src/content/lab/ask-the-ledger.md`.

### Deploying ledger-api (Felipe, in Cloudflare)

1. Run `schema.sql`, then `seed.sql`, in the D1 console for database `ledger`.
2. Put the D1 and KV ids in `wrangler.toml` (ids, not secrets), then `npx wrangler deploy --config pipelines/ledger-api/wrangler.toml`. Not tested from this repository.
3. Set `data-api` on the `ledger-live` element in `src/content/lab/ask-the-ledger.md` to the Worker address.
4. Optional scoring: `node pipelines/ledger-api/generate-queries.mjs queries.json`, then `node pipelines/ledger-api/score-sql.mjs queries.json`.

## ledger-eval

Model benchmark for Ask the Ledger: a guarded Workers AI runner, started by hand with the `ledger-benchmark` workflow, and strict offline scoring on four synthetic ledgers. See `pipelines/ledger-eval/README.md`. Tests: `node --test pipelines/ledger-eval/ledger-eval.test.mjs`.

## semantic-layer

The Lab's governed metrics: a dbt project read by MetricFlow on DuckDB, starting with the Ask the Ledger ledger as Parquet and a shared daily calendar. Questions go in as metric and dimension names; MetricFlow writes the SQL. See `pipelines/semantic-layer/README.md`. Tests (Python, and Node for the gold answers): `python -m unittest discover -s pipelines/semantic-layer`.

## ask-benchmark

Is the web enough? The same Claude model answers the same questions with four sets of tools (none; web search, fetch and code; the semantic layer; the semantic layer plus approved calculations), started by hand with the `ask-benchmark` workflow and scored against keys computed from the data. See `pipelines/ask-benchmark/README.md`. Tests, with a scripted model: `python -m unittest discover -s pipelines/ask-benchmark`.

## dst-crashes

Spring clock change and fatal crashes, for `/lab/spring-clock-change-road-deaths`. `extract.mjs` reads NHTSA's FARS accident files for 1996 to 2024 (downloaded into a cache folder you name), joins each crash to its state's clock rule (IANA extract in `data/dst-crashes/tzdata-us.txt`) and to the sun's elevation at its place and minute, and writes daily counts 14 days either side of two spring Sundays. `analyse.mjs` writes the estimates and `chart.mjs --write` draws the page's SVG chart. Plain Node; `extract.mjs` also needs the `unzip` command. Tests: `node --test pipelines/dst-crashes/dst.test.mjs scripts/dst-page.test.mjs`.

## aviation-reliability

The flight-reliability project behind `/lab/aviation-reliability`. `fetch_package.py` downloads the public Kaggle package (Version 3) signed out and checks it without running any of it: the 34 source files against `data/aviation-reliability/source-code-checksums.json`, and the 16 copies in `data/aviation-reliability/` against the package's own files. The `flight-package` workflow runs it. See `pipelines/aviation-reliability/README.md`. Tests: `python -m unittest discover -s pipelines/aviation-reliability`.

## power-lockdown

Brazil's power load in the 2020 lockdowns, for `/lab/brazil-lockdown-power-load`. `fetch.mjs` downloads ONS hourly load (2018 to 2021), ONS substation and transformer tables, OxCGRT's Brazil state rows and the IBC-Br series into `data/power-lockdown/raw/`, with their SHA-256 hashes. `analyse.mjs` runs 41 checks, builds the calendar and the state-to-subsystem bridge, and writes `data/power-lockdown/results.json` and the tables the semantic layer reads (`models/power_lockdown/` in `pipelines/semantic-layer`). Plain Node. Tests: `node --test pipelines/power-lockdown/power.test.mjs`.
