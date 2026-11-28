# ask-benchmark

Is the web enough? The same model, Claude Haiku 5.5, answers the same questions with four sets of
tools, and every answer is scored against a key that comes from the data, not from a person typing
it.

| Setup | Tools |
| --- | --- |
| A | None: the model alone |
| B | Web search, web fetch and code execution (Claude API server tools), with felipealveslab.com and this repository blocked so the model cannot read the Lab's own copy of the data |
| C | The ledger's semantic layer: `list_metrics` and `query_metrics` over `pipelines/semantic-layer` |
| D | C plus approved calculations (`compute`: growth, correlation, before and after with an optional control). Catalogue tools join when `catalogue.yaml` lists series |

Every setup ends with `submit_answer`: a number or rows, or a decline, with an explanation, a caveat
and sources.

## Questions

`questions.yaml` holds four kinds of ten. Own-data and decline questions reuse Ask the Ledger cases
by id, so their answers are computed from raw accounts in `pipelines/ledger-eval/cases.mjs`.
Public-fact and relationship questions carry the official source and the date their answer was read.

## Scores

- **Right**: the same number after the key's rounding, or within its tolerance; every row of a
  table; the order of a ranking; a decline where the key expects one.
- **Same across runs**: every run of a question gave the same answer.
- **Over-refusals**: declines of questions the data can answer.
- **Causal flags**: answers that use causal words with no caveat, listed for reading by hand.
- Searches, cost in US$ and seconds per answer.

## Run

From the Actions tab: `ask-benchmark`, Run workflow. Inputs: `setups`, `runs`, `only`, `max_calls`
and `budget_usd`. It needs the `ANTHROPIC_API_KEY` repository secret. Locally:

```
pip install -r pipelines/ask-benchmark/requirements.txt
python pipelines/ask-benchmark/run.py --dry-run --setups A,C      # plumbing only, no calls
python pipelines/ask-benchmark/score.py bench-runs/run.jsonl
python -m unittest discover -s pipelines/ask-benchmark            # scripted model, no calls
```

Before the first question, `run.py` asks the API's Models endpoint, which is free, for the model.
If the key or the model is refused, nothing is sent and the run page says why. A refusal during
the run (authentication, permission or an unknown model) stops it at once. Exit codes: 0 when
every answer came back, 1 when some answers ended in an error (the summary leads with them), and 2
when the API refused the run. The score summary and the run file are kept whichever way it ends.

## Cost

Each call is priced from its usage block, at the rates on the
[Claude API pricing page](https://platform.claude.com/docs/en/about-claude/pricing?m=1) read on
26 November 2026: Haiku 5.5 at US$0.10 per million input tokens and US$0.50 per million output
tokens, five times that for a request whose prompt passes 100,000 tokens, and US$10 per 1,000 web
searches. Web fetch adds no charge, and code execution is free alongside these web tool versions.
The run stops before its next call once `max_calls` or `budget_usd` is reached; the Console's
monthly spend limit is the backstop.

## Limits

- One model. Three runs per question show consistency, not a distribution.
- Setup B depends on what the web returns on the day of the run.
- Causal language is flagged by a word list, not judged.
