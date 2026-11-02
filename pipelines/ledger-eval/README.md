# ledger-eval

Model benchmark for Ask the Ledger: does a Workers AI model turn the page's finance questions into the right SQL, and does it decline when it should? **No model has been run yet.**

## What it measures

- **Questions.** `legacy47` is the page's 47 questions, unchanged. `validation20` is 20 more, written together with `candidate-prompt.txt` on 2026-11-02. That prompt's rules cover all 10 of their refusal cases, so they are not held out from it.
- **Checking.** Each reply's SQL goes through the live Worker's validator (`../ledger-api/validate.mjs`), then runs on four synthetic ledgers: seed 2027, seed 2028, zero revenue, and a perturbed copy. A query that returns a constant or a hard-coded total passes the first and fails the others. The summary shows each ledger and the count right on all four.
- **Strict scoring.** A single figure is one row with one number. A table has one label and one number per row. Amounts must be exact; gross margin may be off by 0.05 points. The page's older scorer accepted any matching number in any column. Replies with the right figures in another shape are counted as "right figures, wrong shape", never as right.
- **Two accuracies.** Figure accuracy and refusal accuracy are reported apart. Every refusal question in both sets matches an explicit rule in the candidate prompt (EBITDA, net profit, operating profit margin, counts, growth, forecasts, "why", a month with no year…), so a higher refusal score for it mostly shows that it was told the rules.
- **Prompts.** `baseline` is the live Worker's `SYSTEM_PROMPT`. `candidate` also states the fixed October 2026 reporting month, the gross-margin formula, the product's refusal scope and the answer shape. Neither is tuned on results.

## Running it

GitHub Actions → `ledger-benchmark` → Run workflow. Manual only. It needs the repository secrets `CF_ACCOUNT_ID` and `CF_AI_TOKEN` (Cloudflare dashboard → Workers AI → Use REST API → Create a Workers AI API Token; [steps](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)). The account is on Workers Free (confirmed by Felipe, 2026-11-02): calls fail once the 10,000 daily neurons are used, and nothing is billed ([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), opened 2026-11-02).

Suggested order, started after 00:00 UTC (04:00 in Dubai) so the day's allowance is fresh, with room left for the live box:

| Day | Run | Prompt | Model | Suite | Max requests | Budget (neurons) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Pilot | baseline | qwen2.5-coder-32b | legacy47 | 5 | 500 |
| 1 | 1 | baseline | qwen2.5-coder-32b | legacy47 | 47 | 2,500 |
| 1 | 2 | candidate | qwen2.5-coder-32b | legacy47 | 47 | 4,000 |
| 1 | 3 | candidate | llama-3.2-3b | legacy47 | 47 | 1,000 |
| 2 | 4–6 | as runs 1–3 | | validation20 | 20 | 1,200 / 1,800 / 500 |

Estimated use, from published rates and an assumed 250 output tokens a reply (not measured; the pilot measures it): about 1,800, 3,400 and 540 neurons for runs 1–3, and 2,500 for runs 4–6 together.

Each run saves `run.json` (raw replies, SQL, token counts, times) and `run.scored.json` as an artifact, and writes a summary table on the run page. Locally, with `CF_ACCOUNT_ID`, `CF_API_TOKEN` and `LEDGER_ACCOUNT_PLAN=free` set in your shell (never in a file here):

```bash
node pipelines/ledger-eval/run.mjs --dry-run
node pipelines/ledger-eval/run.mjs --prompt baseline --suite legacy47 --max-requests 5 --free-budget-neurons 500 --out ledger-eval-runs/pilot.json
node pipelines/ledger-eval/score-run.mjs ledger-eval-runs/pilot.json
```

## Files

- `cases.mjs`: the 67 questions, their independent answers and the hand-written reference SQL.
- `scenarios.mjs`: the four ledgers.
- `scoring.mjs`: validation, read-only execution, strict comparison and the summary.
- `safe-scoring.mjs`, `sql-worker.mjs`: scoring in a separate process that is killed after 2 seconds.
- `cloudflare.mjs`, `measurement.mjs`: the REST call (max_tokens 400, temperature 0, no retries) and usage accounting.
- `run.mjs`, `score-run.mjs`: the runner and the scorer.
- `candidate-prompt.txt`; `models.json`: neuron rates, read on 2026-11-02.
- `ledger-eval.test.mjs`: 26 tests, none of which call a model.

## Limits

- Synthetic data and a narrow, fixed question set. Nothing here says how a model handles a real ledger.
- One run does not measure stability. Response times include the network and are a small sample.
- The benchmark uses temperature 0; the live Worker uses the model's default, so live answers can differ.
- Neuron figures come from token counts at published rates, not from Cloudflare's meter.
- The explanation each reply gives is saved but not graded.
- Correlated subqueries can still be slow. The scorer kills them after 2 seconds; D1 would not.

## Provenance

Adapted from an external evaluation package (2 Nov 2026, pinned to commit 206ccfd): the question sets, independent answers, reference SQL, strict scorer, isolated scoring and the guarded runner. Changes here: it imports the live Worker's prompt and validator instead of a frozen copy; it flags "right figures, wrong shape"; a resumed run no longer keeps the previous run's stop reason; `--out` is required.
