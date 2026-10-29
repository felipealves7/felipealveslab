# pipelines/

Ingestion and transformation code, one folder per pipeline, with its tests next to it.
Scheduled refreshes run as GitHub Actions workflows; the agents step in when something is new or broken.

## ask-the-ledger

Synthetic ledger, a small semantic layer, a keyword translator, a hand-written test set and a scorer. Run `node pipelines/ask-the-ledger/evaluate.mjs` to rebuild `data/ask-the-ledger/results.json`. Tests: `node --test pipelines/ask-the-ledger/ledger.test.mjs`.

## airport-contract

Reads three public OurAirports tables, checks them against a written 19-check data contract and an upstream freshness limit, and appends one run to `data/airport-contract/results.json`. Run `node pipelines/airport-contract/run.mjs` (needs network). Tests: `node --test pipelines/airport-contract/contract.test.mjs`.

## ledger-api

Cloudflare Worker for the live box on Ask the Ledger: origin check, daily caps, model call, SQL validator, D1. Also the D1 `schema.sql` and `seed.sql`, a scorer for model-written SQL, and the recorded example session. Regenerate the SQL with `node pipelines/ledger-api/build-sql.mjs`. Tests: `node --test pipelines/ledger-api/ledger-api.test.mjs`. Setup for Felipe: run `schema.sql` then `seed.sql` in the D1 console, put the real D1 and KV ids in `wrangler.toml`, deploy the Worker, then set `data-api` on the `ledger-live` box in `src/content/lab/ask-the-ledger.md`.

### Deploying ledger-api (Felipe, in Cloudflare)

1. Run `schema.sql`, then `seed.sql`, in the D1 console for database `ledger`.
2. Put the D1 and KV ids in `wrangler.toml` (ids, not secrets), then `npx wrangler deploy --config pipelines/ledger-api/wrangler.toml`. Not tested from this repository.
3. Set `data-api` on the `ledger-live` element in `src/content/lab/ask-the-ledger.md` to the Worker address.
4. Optional scoring: `node pipelines/ledger-api/generate-queries.mjs queries.json`, then `node pipelines/ledger-api/score-sql.mjs queries.json`.
