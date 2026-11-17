# data/attention/

Page data for `/lab/where-does-my-attention-go` (The Human Variable, December 2026).

- **Source:** Felipe Alves's own experience-sampling answers, collected by the `attention-pings`
  Worker (`pipelines/attention-pings/`) from 1 to 22 December 2026, and his stated priorities.
- **Licence:** not applicable; Felipe's own data.
- **Synthetic:** no.
- **What is published:** aggregates only, meaning categories, counts, shares with 95% Wilson intervals,
  and mood averages for groups of at least 5 answers. Raw answers stay in Cloudflare D1. No id,
  timestamp or single answer is written here; `run.mjs` refuses a file that carries one.
- **Update cadence:** rebuilt by hand during and after collection with
  `node pipelines/attention-pings/run.mjs` (needs `ATTENTION_URL` and `ATTENTION_TOKEN` in the shell).
- **Retrieved:** `results.json` was generated on 2026-11-17, before collection, with `--empty`: zero pings.

## Files

- `results.json`: `collection` (dates), `priorities` (when written, how many), `summary` (pings
  scheduled, sent, failed, not sent, answered, missed; off-task share; per-project shares; activity and
  time-focus counts; mood groups; answered and sent by local three-hour block), and `comparison`
  (stated rank against reported share per project, or null until priorities are committed).
- `priorities.json`: Felipe adds this before 1 December 2026. Format:

  ```json
  { "writtenAt": "2026-11-30", "projects": [{ "name": "Project A", "rank": 1 }, { "name": "Project B", "rank": 2 }] }
  ```

  The names must match the Worker's `PROJECTS` setting exactly. Project names are published.
