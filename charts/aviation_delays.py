"""Flight reliability lab: every observed arrival in 15-minute bands of arrival delay.

The page builds one row per band from data/aviation-reliability/delay_histogram.csv
(src/lib/charts/aviation.mjs): `start` (minutes), the axis label `tick`, `flights`, `late` (true
from 15 minutes) and the readout for the band, written by the page.
"""

import altair as alt

import theme

NAME = "aviation-delays"
WIDTH = 650
HEIGHT = 220

DESCRIPTION = (
    "Arrival delay of every observed arrival in 15-minute bands, from more than 30 minutes early to "
    "180 minutes or more late, with the line at 15 minutes from which a flight counts as late. The "
    "table under the chart lists every band."
)

THOUSANDS = (
    "datum.value >= 1e6 ? format(datum.value / 1e6, '.1~f') + 'M' "
    ": datum.value >= 1e3 ? format(datum.value / 1e3, '.0f') + 'K' : format(datum.value, '.0f')"
)


def chart() -> alt.LayerChart:
    band = alt.param(name="band", value=None)
    rows = alt.Chart(theme.rows())
    x = alt.X(
        "tick:O",
        sort=alt.EncodingSortField(field="start", op="min"),
        title="Minutes late on arrival (negative = early)",
        scale=alt.Scale(paddingInner=0.18, paddingOuter=0.1),
        axis=alt.Axis(labelAngle=0, grid=False, ticks=False, labelOverlap="parity", labelSeparation=6),
    )
    y = alt.Y("flights:Q", title=None, axis=alt.Axis(tickCount=4, labelExpr=THOUSANDS))

    unit = (
        alt.Chart(alt.Data(values=[{}]))
        .mark_text(text="Flights", align="left", baseline="bottom", dy=-8, color=theme.MUTED, aria=False)
        .encode(x=alt.value(0), y=alt.value(0))
    )
    bars = (
        rows.mark_bar(cornerRadiusEnd=4, aria=False, tooltip=alt.ExprRef("datum.readout"))
        .encode(
            x=x,
            y=y,
            color=alt.condition("datum.start === band", alt.value(theme.INK), alt.value(theme.DATA)),
        )
        .properties(name="bars")
    )
    # The line in the gap before the 15-minute band: from there on a flight counts as late.
    at_15 = alt.X("tick:O", sort=alt.EncodingSortField(field="start", op="min"), bandPosition=0)
    gap = alt.ExprRef("-bandwidth('x') * 0.09 / 0.82")
    boundary = rows.transform_filter("datum.start === 15").mark_rule(color=theme.INK, opacity=1, xOffset=gap, aria=False).encode(x=at_15)
    boundary_label = (
        rows.transform_filter("datum.start === 15")
        .mark_text(text="Late from 15 minutes", align="left", baseline="top", dx=6, dy=2, fontWeight=600, aria=False)
        .encode(x=at_15, y=alt.value(0))
    )

    return (
        alt.layer(unit, bars, boundary, boundary_label)
        .add_params(band)
        .properties(
            width=WIDTH,
            height=HEIGHT,
            description=DESCRIPTION,
            usermeta={
                "generator": "charts/aviation_delays.py",
                "rows": ["rows"],
                "live": {"pick": {"mark": "bars_marks", "by": "x", "signal": "band", "key": "start"}},
            },
        )
    )
