# pipelines/

Ingestion and transformation code, one folder per pipeline, with its tests next to it.
Scheduled refreshes run as GitHub Actions workflows; the agents step in when something is new or broken.

## ask-the-ledger

Synthetic ledger, a small semantic layer, a keyword translator, a hand-written test set and a scorer. Run `node pipelines/ask-the-ledger/evaluate.mjs` to rebuild `data/ask-the-ledger/results.json`. Tests: `node --test pipelines/ask-the-ledger/ledger.test.mjs`.

## airport-contract

Reads three public OurAirports tables, checks them against a written 19-check data contract and an upstream freshness limit, and appends one run to `data/airport-contract/results.json`. Run `node pipelines/airport-contract/run.mjs` (needs network). Tests: `node --test pipelines/airport-contract/contract.test.mjs`.

## ledger-api

The Cloudflare Worker behind the live box on Ask the Ledger: origin check, daily caps, one model call, SQL validation, a read-only run on D1. Also the SQL scorecard and `build-data.mjs`, which writes `schema.sql`, `seed.sql` and the recorded session into `data/ask-the-ledger/`. Run `node pipelines/ledger-api/build-data.mjs` to rebuild. Tests: `node --test pipelines/ledger-api/ledger-api.test.mjs`. Deploy steps are in the pull request for issue #12.
