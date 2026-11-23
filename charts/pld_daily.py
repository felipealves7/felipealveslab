"""Brazil hourly power price lab: daily mean price by submarket, one panel each, on one scale.

The chart reads the results file the page already serves, /data/ccee-pld/results.json, written by
pipelines/ccee-pld/run.mjs, and shapes `summary.daily` with Vega-Lite transforms. It holds no
numbers of its own, so it changes only when the pipeline's results change.

The page sets three things the chart leaves open (see charts/README.md):
- `period`: "all" or a year such as "2024", from the buttons above the chart.
- `day`: the day under the pointer or the keyboard focus, as "YYYY-MM-DD", or null.
- The width of each panel, to the width of the page column it is shown in.
"""

import altair as alt

import theme

NAME = "pld-daily"
DATA_URL = "/data/ccee-pld/results.json"
SUBMARKETS = ["SUDESTE", "SUL", "NORDESTE", "NORTE"]
WIDTH = 650  # each panel, at the widest page column; the page lays it out to the width it has
HEIGHT = 74  # each panel

DESCRIPTION = (
    "Daily mean of the 24 hourly power prices in R$/MWh, one panel per Brazilian submarket: "
    "SUDESTE, SUL, NORDESTE and NORTE, all on one scale from zero. Each panel title gives the "
    "highest daily mean in the period shown. The yearly figures are in the table below the chart."
)


def chart() -> alt.FacetChart:
    period = alt.param(name="period", value="all")
    day = alt.param(name="day", value=None)

    x = alt.X(
        "day_start:T",
        timeUnit="utcyearmonthdate",
        title=None,
        axis=alt.Axis(format={"year": "%Y", "quarter": "%b", "month": "%b", "date": "%-d %b"}, tickCount=6),
    )
    y = alt.Y("price:Q", title=None, axis=alt.Axis(format=",.0f", tickCount=3))

    # 1.5 px rather than the theme's 2 px: a panel holds years of daily points, and a thinner line keeps
    # the day-to-day swings readable.
    line = alt.Chart().mark_line(strokeWidth=1.5, aria=False).encode(x=x, y=y).properties(name="line")
    # The highest daily mean in the period, the one value each panel labels.
    peak = (
        alt.Chart()
        .mark_point(clip=True, aria=False)
        .encode(x=x, y=y)
        .transform_filter("datum.dates === datum.peak.dates")
    )
    # The day the page points at: a hairline across every panel, a dot on each line, and the
    # readout of all four submarkets that day. Dots and rule are clipped to the panel, so pointing
    # at a day never moves the layout; a dot on the first or last day shows as a half dot.
    on_day = alt.Chart().transform_filter("datum.dates === day")
    rule = on_day.mark_rule(clip=True, aria=False).encode(x=x)
    readout = (
        on_day.mark_point(color=theme.INK, clip=True, aria=False)
        .encode(
            x=x,
            y=y,
            tooltip=[
                alt.Tooltip("day_start:T", timeUnit="utcyearmonthdate", title="Day", format="%-d %b %Y"),
                *[alt.Tooltip(f"{s}:Q", title=s, format=",.2f") for s in SUBMARKETS],
            ],
        )
        .properties(name="readout")
    )

    panels = alt.layer(line, peak, rule, readout).properties(width=WIDTH, height=HEIGHT)

    return (
        panels.facet(
            row=alt.Row(
                "panel:N",
                sort=alt.EncodingSortField(field="order", op="min"),
                title=None,
                header=alt.Header(labelLimit=0),
            ),
            data=alt.UrlData(url=DATA_URL, format=alt.JsonDataFormat(type="json", property="summary.daily")),
        )
        .transform_calculate(**{s: f"datum.series.{s}" for s in SUBMARKETS})
        .transform_flatten(["dates", *SUBMARKETS])
        .transform_filter("period == 'all' || substring(datum.dates, 0, 4) == period")
        .transform_calculate(day_start="toDate(datum.dates + 'T00:00:00Z')")
        .transform_fold(SUBMARKETS, as_=["submarket", "price"])
        .transform_calculate(order=f"indexof({SUBMARKETS!r}, datum.submarket)")
        .transform_joinaggregate(peak="argmax(price)", groupby=["submarket"])
        .transform_calculate(
            panel=(
                "datum.submarket + ' · peak ' + format(datum.peak.price, ',.0f') + ' on ' "
                "+ utcFormat(datum.peak.day_start, '%-d %b %Y')"
            )
        )
        .add_params(period, day)
        .properties(
            description=DESCRIPTION,
            usermeta={
                "generator": "charts/pld_daily.py",
                "live": {"day": "day", "key": "dates", "snap": "line_marks", "readout": "readout_marks", "params": ["period"]},
            },
        )
    )
