# Ask the Ledger model benchmark: data

- **Source:** six runs of the `ledger-benchmark` GitHub Actions workflow on 2026-11-03, started from `main`. Each run asked a Cloudflare Workers AI model to write SQL for the Ask the Ledger test questions. The ledger is synthetic: the code in `pipelines/ask-the-ledger/` and `pipelines/ledger-eval/` generates it. No real company, employer or third-party data.
- **Licence:** none needed for the ledger or the questions (this repository's code, MIT). The stored replies are short SQL written by two models served by Cloudflare: Qwen2.5-Coder 32B Instruct and Llama 3.2 3B Instruct. Those models' licences and terms for reuse of their output have not been checked.
- **Date generated:** 2026-11-03.
- **Synthetic:** yes.
- **Files:**
  - `runs/run-N.json`: the raw run file from the workflow artifact `ledger-eval-run-N` (model replies, SQL, token counts, times), unchanged. N is the GitHub run number of the workflow. Runs 1 and 2 were a one-question and a five-question test and are not kept.
  - `runs.json`: by hand, which GitHub run and artifact each file came from, with the artifact's sha256 as shown on the run page. An artifact held `run.json` and `run.scored.json`, zipped; the digest is of the zip. It was recomputed on 2026-11-03 from the copies Felipe supplied, and all six matched. The stored `run.json` files are byte-identical to the ones in those zips.
  - `results.json`: computed, not edited. Every run scored again with `pipelines/ledger-eval/score-run.mjs` on four ledgers, reduced to counts and verdicts, plus the SQL and returned rows for questions that were not right on all four. The Ask the Ledger page quotes it.
- **Rebuild:** `node pipelines/ledger-eval/build-results.mjs` writes `results.json` (about 40 seconds). With `--check` it fails if the stored file differs from a fresh scoring.
- **Not kept:** the `run.scored.json` files. They hold the same scoring in a larger form and can be rebuilt from `runs/`.
- **Limits:** one run per row, temperature 0, free-plan models. See the page for what the numbers do and do not show.
