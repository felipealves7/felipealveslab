# charts/

The site's charts in Altair, the Python library for Vega-Lite, with one theme for every chart
(`theme.py`). Each chart is a Python module; `build.py` writes its
Vega-Lite spec to `src/charts/<name>.vl.json`, and the site build does the rest in Node:

1. `src/lib/charts/render.mjs` compiles the spec to Vega, refusing any Vega-Lite warning, and draws it
   to SVG twice: for the widest page column (718 px) and for a 375 px phone (349 px inside the
   frame). Both drawings go into the page, so the chart reads with no JavaScript.
2. `src/lib/charts/figure.mjs` adds the controls, the compiled chart as JSON, and a table view.
3. In the browser, `src/lib/charts/live.mjs` loads Vega from this site when the chart comes within
   400 px of the screen, draws the same spec at the column's width, and wires the controls, the
   pointer and the arrow keys. Vega runs with its expression interpreter, so the site's security
   headers need no `unsafe-eval`.

A spec reads its data from a file the site serves under `/data/`, never inline and never from
another site, so a chart changes only when its pipeline's results change.

## Charts

| Module | Page | Data |
| --- | --- | --- |
| `pld_daily.py` | `/lab/brazil-power-price-contract` | `/data/ccee-pld/results.json` |

## What a chart leaves to the page

A chart names, in `usermeta.live`, what the page sets:

- `params`: parameters set by the buttons above the chart, such as `period`.
- `day`: the parameter holding the day the reader points at, or null; `key` is the data field that
  names a day.
- `snap`: the mark whose points the pointer and the arrow keys move along (the first panel's line).
- `readout`: the mark whose tooltip encoding is shown as the readout for that day.

The width of each panel is laid out by the page (`child_width`), so a chart keeps a fixed axis
width (`theme.Y_AXIS_WIDTH`) and draws its hover marks clipped to the panel: pointing at a day never
moves the layout.

## Run

```
pip install -r charts/requirements.txt
python3 charts/build.py            # write src/charts/*.vl.json
python3 charts/build.py --check    # exit 1 if a saved spec is not what the code makes
python3 -m unittest discover -s charts
node --test scripts/altair-charts.test.mjs
```
