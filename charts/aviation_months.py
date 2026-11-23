"""Flight reliability lab: one measure at a time, by month, the latest year against the year before.

The page builds one row per measure and month from data/aviation-reliability/mart_month.csv
(src/lib/charts/aviation.mjs): `measure`, `month`, the two years and their values as
`yearBefore`, `yearAfter`, `before` and `after` (rates in percentage points), the axis title, and
the readout for that month, written by the page. The page's buttons set `measure`.
"""

import altair as alt

import theme

NAME = "aviation-months"
WIDTH = 650
HEIGHT = 230

DESCRIPTION = (
    "One flight reliability measure by month, the latest year against the year before, from the "
    "pipeline's monthly totals. The buttons above the chart pick the measure; the table under it "
    "lists every value."
)


def chart(first_measure: str = "mean_signed_delay") -> alt.LayerChart:
    measure = alt.param(name="measure", value=first_measure)
    month = alt.param(name="month", value=None)

    rows = alt.Chart(theme.rows()).transform_filter("datum.measure === measure")
    years = rows.transform_fold(["before", "after"], as_=["series", "value"]).transform_filter("isValid(datum.value)")
    # Two years: each line carries its year at its last month, and the caption names the colours.
    year = alt.Color("year:N", scale=alt.Scale(range=[theme.COMPARE, theme.DATA]), sort="ascending", legend=None)
    with_year = years.transform_calculate(year="datum.series === 'before' ? datum.yearBefore : datum.yearAfter")

    x = alt.X(
        "month:Q",
        title=None,
        scale=alt.Scale(domain=[1, 12], nice=False),
        axis=alt.Axis(values=list(range(1, 13)), labelExpr="['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][datum.value - 1]", grid=False, labelFlush=False),
    )
    y = alt.Y("value:Q", title=None, scale=alt.Scale(zero=False, nice=True), axis=alt.Axis(tickCount=4))

    unit = (
        rows.transform_filter("datum.month === 1")
        .mark_text(align="left", baseline="bottom", dy=-8, color=theme.MUTED, aria=False)
        .encode(x=alt.value(0), y=alt.value(0), text="axisTitle:N")
    )
    lines = with_year.mark_line(aria=False).encode(x=x, y=y, color=year).properties(name="lines")
    # Each line's year at its last month.
    ends = (
        with_year.transform_joinaggregate(last="max(month)", groupby=["series"])
        .transform_filter("datum.month === datum.last")
        .mark_text(align="left", dx=8, fontWeight=600, aria=False)
        .encode(x=x, y=y, text="year:N")
    )
    on_month = with_year.transform_filter("datum.month === month")
    rule = on_month.mark_rule(clip=True, aria=False).encode(x=x)
    # The readout lists both years for the month; the page writes its text, with the years in it.
    readout = (
        on_month.mark_point(clip=True, aria=False, tooltip=alt.ExprRef("datum.readout"))
        .encode(x=x, y=y, color=year)
        .properties(name="readout")
    )

    return (
        alt.layer(unit, lines, ends, rule, readout)
        .add_params(measure, month)
        .properties(
            width=WIDTH,
            height=HEIGHT,
            description=DESCRIPTION,
            usermeta={
                "generator": "charts/aviation_months.py",
                "rows": ["rows"],
                "live": {
                    "params": ["measure"],
                    "pick": {"mark": "lines_marks", "by": "x", "signal": "month", "key": "month", "readout": "readout_marks"},
                },
            },
        )
    )
