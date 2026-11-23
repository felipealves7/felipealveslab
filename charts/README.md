# charts/

The site's charts in Altair, the Python library for Vega-Lite, with one theme for every chart
(`theme.py`: fonts, text colours, gridlines, series colours and check states from the site tokens).
Each chart is a Python module; `build.py` writes its Vega-Lite spec to `src/charts/<name>.vl.json`,
and the site build does the rest in Node:

1. `src/lib/charts/render.mjs` compiles the spec to Vega, refusing any Vega-Lite warning, fills in
   the rows the page built from its saved results, and draws the chart to SVG twice: for a wide
   container (718 px) and for a 375 px phone (349 px inside the frame). CSS container queries pick
   the drawing, so the chart reads with no JavaScript. A chart that keeps its own size (the check
   squares) is drawn once.
2. `src/lib/charts/figure.mjs` adds the caption, the buttons, a table view and the source line.
   Card charts (`compact`) are drawn at card sizes (520 and 305 px) and do not run live.
3. In the browser, `src/lib/charts/live.mjs` loads Vega from this site when a live chart comes
   within 400 px of the screen, draws the same spec at the frame's width, and wires the buttons, the
   pointer, touch and the arrow keys. Vega runs with its expression interpreter, so the site's
   security headers need no `unsafe-eval`.

A chart's data is either a file the site serves under `/data/` (the PLD chart reads its results
file) or rows the page builds from its saved results at build time (`theme.rows()`, listed in the
spec's `usermeta.rows`). No figure is written into a spec, so a chart changes only when its saved
results change.

## Charts

| Module | Spec | Where | Data |
| --- | --- | --- | --- |
| `pld_daily.py` | `pld-daily` | `/lab/brazil-power-price-contract` | `/data/ccee-pld/results.json` |
| `dst_days.py` | `dst-days` | `/lab/spring-clock-change-road-deaths` | rows from `data/dst-crashes/results.json` |
| `aviation_months.py` | `aviation-months` | `/lab/aviation-reliability` | rows from `mart_month.csv` |
| `aviation_delays.py` | `aviation-delays` | `/lab/aviation-reliability` | rows from `delay_histogram.csv` |
| `bars.py` | `bars`, `bars-change` | Ask the Ledger benchmark, the Lab evidence cards, the Sinalvo sectors, kinds of work and payment grades | rows built by each page |
| `checks.py` | `checks` | `/lab/airport-data-contract` and its Lab card | rows from `data/airport-contract/results.json` |
| `zoom.py` | `zoom` | `/case-studies/sinalvo` | rows from `data/sinalvo/figures.json` |

The Node side of each chart is in `src/lib/charts/` (`pld.mjs`, `dst.mjs`, `aviation.mjs`,
`lab.mjs`, `evidence.mjs`, `sinalvo.mjs`, and `bars.mjs` for every bar chart).

## What a chart leaves to the page

A chart names, in `usermeta.live`, what the page sets:

- `params`: parameters set by the buttons above the chart, such as `period` or `measure`.
- `width`: `false` for a chart that keeps its own size; otherwise the page lays the plot out to the
  frame's width (`width`, or `child_width` for a faceted chart).
- `pick`: the item the reader points at or moves to with the arrow keys. `mark` names the mark whose
  items can be picked, `by` is `x`, `y` or `xy`, `signal` is the parameter set to the picked
  item's `key` field, and `readout` names the mark whose tooltip is shown (otherwise the picked
  item's own). A readout is a tooltip value: an object of label to value, or an array of a heading
  and `[value, label]` pairs when the page writes it.

Hover marks are clipped to their panel and axes keep one width (`theme.Y_AXIS_WIDTH`), so pointing
at a day never moves the layout, and the drawing made at build time and the live chart line up.

## Run

```
pip install -r charts/requirements.txt
python3 charts/build.py            # write src/charts/*.vl.json
python3 charts/build.py --check    # exit 1 if a saved spec is not what the code makes
python3 -m unittest discover -s charts
node --test scripts/altair-charts.test.mjs
```

CI runs the check, the Python tests and the Node test on every pull request and every push to
`main`: the `charts` job runs the first two, and the `test` job runs the Node test with `npm test`.
