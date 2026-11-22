# Aviation product — native artifact handoff for Claude

**Status:** DRAFT · illustrative reconstructions · not approved for publication.

This branch holds editable **diagrams.net** artifacts outside `src/` and `public/` so the live site remains unchanged. Do not merge or publish automatically.

## Files

- `aviation-product-story-map.drawio`: editable five-stage product story map and illustrative MVP/future boundaries.
- `aviation-exception-decision-flow.drawio`: editable example of evidence-aware operational exception handling.
- `CLAUDE_HANDOFF.md`: this file.

## Editorial integrity

These are **new hypothetical design exercises**, NOT diagrams exported from dnata's BRS, NOT representations of the real historical MVP, backlog, operational logic, or delivered UI. No employer records, internal metrics or architecture have been used.

Before publication, ask the owner to confirm (a) whether the scenarios are substantively relevant to his actual scope and (b) whether any phrases could imply real implemented capabilities. If unconfirmed, title the section "How I would model the problem" and label each visual "Illustrative reconstruction; synthetic workflow." Never imply historical production behavior.

## Proposed placement

Page: `src/pages/case-studies/aviation-platform.astro`.

Put the product story map immediately after the current **Approach** section and consider the exception flow below it as optional detail. **Do not add both if the page becomes visually overloaded.** Recommend story map as the primary artifact.

## Preferred presentation

1. Open the `.drawio` file in https://app.diagrams.net/ and visually confirm it renders.
2. Export accessible SVG from diagrams.net. Save an exported copy under `public/assets/artifacts/aviation/`.
3. Place one responsive SVG in the Astro page as a real diagram artifact, with a link to the editable `.drawio` file.
4. Optionally import the `.drawio` file using Miro's draw.io app to produce a native hosted board, then embed only after confirming public-view permissions.
5. Preserve caption noting illustrative design; keep site palette, keyboard behavior, mobile layout and CSP safe.
6. Run existing test/build/lint workflows and review the published page on desktop and mobile.

**No hosted Miro, Tableau or Figma artifact has been created.** A native service embed requires separate publishing there.

## Candidate tooling across the rest of the portfolio

| Use case | Best primary evidence | Can create now | Needs external publishing |
|---|---|---|---|
| Aviation BRS | Story map / exception flow | draw.io source + SVG export | Miro optional |
| Finance forecasting | Rule evaluation | Synthetic tested CSV + SQL/Python + optional dashboard spec | Tableau Public / Power BI |
| Integrated risk | Metric contract and lineage | draw.io / README / seeded synthetic data | Tableau optional |
| eInvoicing | Status mapping and governance | draw.io / CSV mapping / tests | Power BI / Miro optional |
| Flight reliability | Public-data analysis | Existing repo data + tested chart assets | Tableau Public |
| Ask the Ledger | SQL-evaluation scorecard | Existing run data + eval visual | No external platform needed |
| Airport data contract | Pipeline contract + fault injection | Existing tests + draw.io flow | No external platform needed |
| Brazil hourly power | Public-price data dashboard | Existing source CSV + chart asset | Tableau Public |
| Lost Hour | Statistical comparisons & limitations | Existing FARS-derived data + chart assets | Tableau/Flourish optional |

**Do not invent measured outcomes or historical decisions.** Public source figures must be traceable to source and a dated snapshot.
