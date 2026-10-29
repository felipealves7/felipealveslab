# pipelines/

Ingestion and transformation code, one folder per pipeline, with its tests next to it.
Scheduled refreshes run as GitHub Actions workflows; the agents step in when something is new or broken.

## ask-the-ledger

Synthetic ledger, a small semantic layer, a keyword translator, a hand-written test set and a scorer. Run `node pipelines/ask-the-ledger/evaluate.mjs` to rebuild `data/ask-the-ledger/results.json`. Tests: `node --test pipelines/ask-the-ledger/ledger.test.mjs`.

## airport-contract

Reads three public OurAirports tables, checks them against a written 19-check data contract and an upstream freshness limit, and appends one run to `data/airport-contract/results.json`. Run `node pipelines/airport-contract/run.mjs` (needs network). Tests: `node --test pipelines/airport-contract/contract.test.mjs`.

## ledger-api

Synthetic invoice ledger (seed 2028), 12 fixed scorecard questions with reference queries, a local scorer and the SQL files for D1. The Worker itself is in `worker/ledger-api/`. Run `node pipelines/ledger-api/build.mjs` to rebuild the SQL, scorecard and recorded session. Tests: `node --test pipelines/ledger-api/ledger-api.test.mjs`.
