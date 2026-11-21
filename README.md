# felipealveslab

Source for [felipealveslab.com](https://felipealveslab.com): Felipe Alves's portfolio and Data & AI Lab.

Felipe directs the Lab: he sets the questions, the rules and the acceptance bar, and merges what
ships. Four Claude agents (Scout, Builder, Critic, Keeper) do the research, building, review and
maintenance under those rules, in public. The operating model and its record:
[How the Lab is built](https://felipealveslab.com/lab/how-its-built).

## Lab exhibits

Each exhibit is a page backed by code, saved output and tests in this repository.

| Exhibit | What it shows | Data |
| --- | --- | --- |
| [The lost hour](https://felipealveslab.com/lab/spring-clock-change-road-deaths) | Fatal US road crashes in the work week after the spring clock change, 1996 to 2024, against Arizona and Hawaii and placebo dates | NHTSA FARS, IANA tz |
| [Brazil hourly power price with a data contract](https://felipealveslab.com/lab/brazil-power-price-contract) | A 13-check data contract on Brazil's hourly spot price, with month fingerprints to catch restated months | CCEE open data |
| [Flight reliability: what an average delay hides](https://felipealveslab.com/lab/aviation-reliability) | 11.7 million US flights: a flat average delay next to rising cancellations, every figure checked against the raw counts | BTS on-time data |
| [Airport data with a written contract](https://felipealveslab.com/lab/airport-data-contract) | A weekly pipeline that gates public reference data through a written contract, replayed step by step | OurAirports |
| [Ask the Ledger](https://felipealveslab.com/lab/ask-the-ledger) | Conversational BI: a live, capped question box and a benchmark of four models on four ledgers | Synthetic |

## How it is built

- Rules every agent follows: [`CLAUDE.md`](CLAUDE.md)
- What steers the research: [`interests.yml`](interests.yml); the tools the Lab adopts, trials and holds: [`stack-radar.yml`](stack-radar.yml)
- The agents' prompts: [`.claude/prompts/`](.claude/prompts/)

Stack: Astro, hosted on Cloudflare Pages. Lab pipelines run in plain Node; the flight-reliability
analysis was built with Python and dbt on DuckDB, and its outputs and code are in
`data/aviation-reliability/`. The Ask the Ledger live box is a Cloudflare Worker on Workers AI and
D1. Tests and build checks run in GitHub Actions.

## Layout

- `src/pages/`: the portfolio pages (home, milestones, behind the scenes, four case studies, 404), the Lab hub, the operating-model page and the exhibit page template.
- `src/content/lab/`: one Markdown page per exhibit; `src/content.config.ts` is their schema.
- `src/layouts/Base.astro`, `src/components/`: shared page frame, header and footer, the exhibits' charts and explorers, and the four case-study illustrations.
- `src/lib/`: build-time code behind the charts, the airport replay and the illustrations. The illustrations use synthetic data with fixed random seeds.
- `pipelines/`: each exhibit's pipeline, with its tests next to it.
- `data/`: saved outputs and small datasets, each with a `README` stating source, licence and date.
- `public/`: stylesheets (linked per page in a fixed order; later files override earlier ones), page scripts, images, video, the CV and `_headers` (security headers and caching).
- `scripts/`: repository checks and page tests run by CI. `scripts/check-links.mjs` fails if any internal link, asset or stylesheet reference does not exist.

```sh
npm install
npm run dev      # local site
npm run build    # production build; fails on a malformed Lab page
npm test         # repository checks, page tests and pipeline tests
```

Code is MIT licensed (see `LICENSE`). Written content on the site is not covered by that licence.
