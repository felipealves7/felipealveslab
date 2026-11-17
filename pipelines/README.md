# pipelines/

Ingestion and transformation code, one folder per pipeline, with its tests next to it.
Scheduled refreshes run as GitHub Actions workflows; the agents step in when something is new or broken.

## ask-the-ledger

Synthetic ledger, a small semantic layer, a keyword translator, a hand-written test set and a scorer. Run `node pipelines/ask-the-ledger/evaluate.mjs` to rebuild `data/ask-the-ledger/results.json`. Tests: `node --test pipelines/ask-the-ledger/ledger.test.mjs`.

## airport-contract

Reads three public OurAirports tables, checks them against a written 19-check data contract and an upstream freshness limit, and appends one run to `data/airport-contract/results.json`. Run `node pipelines/airport-contract/run.mjs` (needs network). Tests: `node --test pipelines/airport-contract/contract.test.mjs`.

## attention-pings

Cloudflare Worker for `/lab/where-does-my-attention-go`: plans six random pings a day, sends each to ntfy.sh with a signed link, takes answers on a one-screen form (categories and a 0 to 100 mood, no free text) into D1, and returns aggregates only from `GET /aggregates`. `run.mjs` turns those aggregates and `data/attention/priorities.json` into `data/attention/results.json`. Tests: `node --test pipelines/attention-pings/attention.test.mjs`.

### Deploying attention-pings (Felipe, in Cloudflare and on the phone)

1. Create the D1 database `attention`, run `schema.sql` in its console, and put its id in `wrangler.toml`.
2. Write the ranked projects to `data/attention/priorities.json` and the same names, comma-separated, to `PROJECTS` in `wrangler.toml`. Commit before 1 December 2026.
3. Pick a long random ntfy topic name and subscribe to it in the ntfy phone app.
4. `npx wrangler secret put` for `PING_SECRET`, `NTFY_TOPIC` and `EXPORT_TOKEN` (and `NTFY_TOKEN` if used), set `BASE_URL` to the Worker's address, then `npx wrangler deploy --config pipelines/attention-pings/wrangler.toml`. Not tested from this repository.
5. To refresh the page: `ATTENTION_URL=<worker address> ATTENTION_TOKEN=<export token> node pipelines/attention-pings/run.mjs`.

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
