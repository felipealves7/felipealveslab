"""Lockdown and power-load lab: each day of March to July 2020 against the weekday-aligned days of
2018 and 2019, one panel per ONS subsystem, over the subsystem's weighted stringency.

The page builds one row per subsystem and day from data/power-lockdown/results.json
(src/lib/charts/power.mjs): the day, the panel label and its order, the load as a per cent of the
reference days (null on a holiday, bridge, Carnival or Easter day, or when a reference day is one),
and the weighted stringency from 0 to 100. Load is the line, on the axis. Stringency is a strip along
the foot of each panel, darker the stricter, so the two never share an axis. Every row also carries
the other three subsystems' values for the readout of a day.
"""

import altair as alt

import theme

NAME = "power-lockdown"
WIDTH = 650  # each panel, at the widest page column; the page lays it out to the width it has
HEIGHT = 96  # each panel
SUBSYSTEMS = ["SE", "S", "NE", "N"]
Y_DOMAIN = [70, 125]
STRIP = 14  # px: the stringency strip along the foot of each panel

DESCRIPTION = (
    "Daily power load from 1 March to 31 July 2020 as a per cent of the same weekdays in 2018 and "
    "2019, one panel per subsystem: Southeast/Centre-West, South, Northeast and North. The strip at "
    "the foot of each panel is the subsystem's lockdown stringency, 0 to 100, darker the stricter, "
    "weighted across its states. Holidays "
    "and days compared with a holiday are left out. The table under the chart lists every value."
)


def chart() -> alt.FacetChart:
    day = alt.param(name="day", value=None)

    x = alt.X(
        "day_start:T",
        timeUnit="utcyearmonthdate",
        title=None,
        axis=alt.Axis(format="%-d %b", tickCount=5),
    )
    y = alt.Y(
        "value:Q",
        title=None,
        scale=alt.Scale(domain=Y_DOMAIN, nice=False, zero=False, clamp=True),
        axis=alt.Axis(values=[80, 90, 100, 110, 120], format="d"),
    )

    base = alt.Chart().transform_calculate(day_start="toDate(datum.date + 'T00:00:00Z')")
    # Stringency: one cell a day along the foot of the panel, its opacity the index over 100.
    strip = (
        base.transform_calculate(day_end="datum.day_start + 86400000")
        .mark_rect(color=theme.RUST, aria=False)
        .encode(
            x=x,
            x2="day_end:T",
            y=alt.value(HEIGHT - STRIP),
            y2=alt.value(HEIGHT),
            opacity=alt.Opacity("stringency:Q", scale=alt.Scale(domain=[0, 100], range=[0, 1]), legend=None),
        )
    )
    normal = alt.Chart().mark_rule(color=theme.MUTED, strokeDash=[4, 3], aria=False).encode(y=alt.datum(100))
    # Gaps stay gaps: a day left out of the comparison breaks the line rather than joining across it.
    line = (
        base.transform_calculate(value="datum.load_pct")
        .mark_line(strokeWidth=1.75, aria=False, invalid="break-paths-show-domains")
        .encode(x=x, y=y)
        .properties(name="line")
    )
    on_day = base.transform_filter("datum.date === day")
    rule = on_day.mark_rule(clip=True, aria=False).encode(x=x)
    readout = (
        on_day.transform_filter("datum.load_pct !== null").transform_calculate(value="datum.load_pct")
        .mark_point(color=theme.INK, clip=True, aria=False)
        .encode(
            x=x,
            y=y,
            tooltip=[
                alt.Tooltip("day_start:T", timeUnit="utcyearmonthdate", title="Day", format="%a %-d %b %Y"),
                *[alt.Tooltip(f"{s}_load:N", title=f"{s} load, % of 2018–19") for s in SUBSYSTEMS],
                *[alt.Tooltip(f"{s}_stringency:Q", title=f"{s} stringency", format=".1f") for s in SUBSYSTEMS],
            ],
        )
        .properties(name="readout")
    )

    panels = alt.layer(strip, normal, line, rule, readout).properties(width=WIDTH, height=HEIGHT)

    return (
        panels.facet(
            row=alt.Row(
                "panel:N",
                sort=alt.EncodingSortField(field="order", op="min"),
                title=None,
                header=alt.Header(labelLimit=0),
            ),
            data=theme.rows(),
        )
        .add_params(day)
        .properties(
            description=DESCRIPTION,
            usermeta={
                "generator": "charts/power_lockdown.py",
                "rows": ["rows"],
                "live": {"pick": {"mark": "line_marks", "by": "x", "signal": "day", "key": "date", "readout": "readout_marks"}},
            },
        )
    )
