# ledger-api

Cloudflare Worker behind the live box on the Ask the Ledger page. Design and limits: issue #12.

- Bindings: `LEDGER` (D1 `ledger`), `COUNTERS` (KV `ledger-counters`), `AI` (Workers AI).
- Not yet deployed or run against real Cloudflare. Tests use fakes for D1, KV and the model: `npm test`.
- `sql/schema.sql` and `sql/seed.sql` are generated: `node pipelines/ledger-api/build.mjs`. Run them in the D1 console, schema first.
- Deploy: replace the two ids in `wrangler.toml`, then `npx wrangler deploy` from this folder. Not tested here.
- Haiku later: set `MODEL_PROVIDER = "anthropic"` in `wrangler.toml` and add `ANTHROPIC_API_KEY` as a Worker secret in Cloudflare. Never put it in the repository.
