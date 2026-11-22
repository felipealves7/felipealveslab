"""The site's chart theme for Altair, registered as "felipealveslab".

Every Altair chart on felipealveslab.com uses this one theme, so charts share their fonts, text
colours, gridlines and marks with the rest of the site (tokens in public/css/legacy.css).

Colours, all on the chart surface CREAM (#f8f6f0):
- INK #1a1a17, 16.1:1, for titles and values.
- MUTED #656561, 5.4:1, for axis labels: the site's rgba(26,26,23,.66) mixed onto the surface.
- DATA #4f5744 (--olive2), 7.0:1, for a single series.
- COMPARE #9a9588, the warm gray of the flight reliability charts, for a second series. It is under
  3:1 against the surface and both colours are low in chroma, so a chart that uses both labels its
  series directly and has a table view. A third series needs a validated colour added here first.
"""

import altair as alt

SANS = '"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif'
CREAM = "#f8f6f0"
INK = "#1a1a17"
MUTED = "#656561"
GRID = "#dddcd6"
BASELINE = "#aaa9a4"
DATA = "#4f5744"
COMPARE = "#9a9588"

# The y axis keeps one width whatever its labels, so the chart can be laid out to the exact width
# of the page column, at build time and in the browser alike.
Y_AXIS_WIDTH = 40

CONFIG = {
    "background": CREAM,
    "padding": {"left": 8, "right": 14, "top": 10, "bottom": 6},
    "font": SANS,
    "view": {"stroke": None},
    "axis": {
        "labelFont": SANS,
        "labelFontSize": 11,
        "labelColor": MUTED,
        "titleFont": SANS,
        "titleFontSize": 11,
        "titleFontWeight": 400,
        "titleColor": MUTED,
        "gridColor": GRID,
        "gridWidth": 1,
        "domainColor": BASELINE,
        "tickColor": BASELINE,
        "labelPadding": 5,
    },
    "axisX": {"grid": True, "domain": True, "ticks": True, "tickSize": 4, "labelFlush": True},
    "axisY": {
        "grid": True,
        "domain": False,
        "ticks": False,
        "minExtent": Y_AXIS_WIDTH,
        "maxExtent": Y_AXIS_WIDTH,
        "labelPadding": 6,
    },
    "header": {
        "labelFont": SANS,
        "labelFontSize": 12,
        "labelFontWeight": 600,
        "labelColor": INK,
        "labelAnchor": "start",
        "labelAngle": 0,
        "labelOrient": "top",
        "labelPadding": 6,
        "titleFontSize": 0,
    },
    "facet": {"spacing": 20},
    "line": {"color": DATA, "strokeWidth": 2, "strokeJoin": "round", "strokeCap": "round"},
    "point": {"color": DATA, "filled": True, "size": 64, "stroke": CREAM, "strokeWidth": 2, "opacity": 1},
    "rule": {"color": INK, "strokeWidth": 1, "opacity": 0.45},
    "bar": {"color": DATA, "cornerRadiusEnd": 4},
    "text": {"font": SANS, "fontSize": 11, "color": INK},
    "range": {"category": [DATA, COMPARE]},
    "legend": {
        "labelFont": SANS,
        "labelFontSize": 11,
        "labelColor": INK,
        "titleFont": SANS,
        "titleFontSize": 11,
        "titleColor": MUTED,
        "titleFontWeight": 400,
        "orient": "top",
        "symbolStrokeWidth": 2,
    },
    "title": {"font": SANS, "fontSize": 15, "fontWeight": 600, "color": INK, "anchor": "start"},
}


@alt.theme.register("felipealveslab", enable=True)
def felipealveslab() -> alt.theme.ThemeConfig:
    return {"config": CONFIG}
