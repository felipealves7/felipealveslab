"""The lost hour lab: fatal crashes on each day around the spring clock change, as a share of an
ordinary day of the same weekday, for the observing states in two eras and for Arizona and Hawaii.

The page builds one row per day from data/dst-crashes/results.json (src/lib/charts/dst.mjs): the
day's offset from the change Sunday, its label, and the three groups' values as `post`, `pre` and
`standard`. The chart folds them into lines, so every row also carries all three values for the
readout of a day.
"""

import altair as alt

import theme

NAME = "dst-days"
WIDTH = 650
HEIGHT = 230
SERIES = [
    ("post", "Change in March, 2007–2024"),
    ("pre", "Change in April, 1996–2006"),
    ("standard", "No change: Arizona and Hawaii"),
]
LABELS = [label for _, label in SERIES]
Y_DOMAIN = [0.8, 1.25]

DESCRIPTION = (
    "Fatal crashes on each day from 14 days before to 13 days after the spring clock change, against "
    "an ordinary day of the same weekday (1.0), for states that change their clocks, in two eras, and "
    "for Arizona and Hawaii, which do not. The table under the chart lists every value."
)


def chart() -> alt.LayerChart:
    day = alt.param(name="day", value=None)
    signed = "datum.value > 0 ? '+' + datum.value : datum.value < 0 ? '−' + abs(datum.value) : '0'"
    x = alt.X(
        "offset:Q",
        title="Days from the change Sunday (0)",
        scale=alt.Scale(domain=[-14.5, 13.5], nice=False, zero=False),
        axis=alt.Axis(values=[-14, -7, 0, 7, 13], labelExpr=signed, grid=False, labelFlush=False),
    )
    y = alt.Y(
        "value:Q",
        title=None,
        scale=alt.Scale(domain=Y_DOMAIN, nice=False, zero=False, clamp=True),
        axis=alt.Axis(values=[0.8, 0.9, 1.0, 1.1, 1.2], format=".1f"),
    )

    # The work week after the change, and the change itself, on the night into Sunday. Each of these
    # has one row of its own, so it is drawn once.
    one = alt.Data(values=[{}])
    week = alt.Chart(one).mark_rect(color=theme.OLIVE, opacity=0.12, aria=False).encode(x=alt.datum(0.5), x2=alt.datum(5.5))
    week_label = (
        alt.Chart(one)
        .mark_text(text="Work week after", baseline="bottom", dy=-4, fontWeight=600, color=theme.MUTED, aria=False)
        .encode(x=alt.datum(3), y=alt.value(0))
    )
    change = alt.Chart(one).mark_rule(strokeDash=[3, 3], opacity=0.6, aria=False).encode(x=alt.datum(-0.5))
    change_label = (
        alt.Chart(one)
        .mark_text(text="Clocks change", align="right", baseline="bottom", dx=-4, dy=-20, fontWeight=600, color=theme.MUTED, aria=False)
        .encode(x=alt.datum(-0.5), y=alt.value(0))
    )
    ordinary = alt.Chart(one).mark_rule(color=theme.INK, opacity=0.45, aria=False).encode(y=alt.datum(1.0))

    # One line per group. Folded in reverse, so the line for the latest era is drawn last, on top.
    groups = (
        alt.Chart(theme.rows())
        .transform_fold([key for key, _ in reversed(SERIES)], as_=["series", "value"])
        .transform_calculate(
            group=" : ".join(f"datum.series === '{key}' ? '{label}'" for key, label in SERIES[:-1]) + f" : '{SERIES[-1][1]}'"
        )
    )
    # Under the chart, so the notes above the plot have the top to themselves.
    legend = alt.Legend(title=None, orient="bottom", direction="vertical", symbolType="stroke", symbolSize=260, labelLimit=0, offset=12)
    colour = alt.Color("group:N", scale=alt.Scale(domain=LABELS, range=theme.SERIES), legend=legend)
    dash = alt.StrokeDash("group:N", scale=alt.Scale(domain=LABELS, range=[[1, 0], [1, 0], [5, 3]]), legend=legend)
    # Arizona and Hawaii have few crashes a day, so their line jumps about; it is drawn thinner.
    weight = alt.condition("datum.series === 'standard'", alt.value(1.5), alt.value(2))
    lines = groups.mark_line(aria=False).encode(x=x, y=y, color=colour, strokeDash=dash, strokeWidth=weight).properties(name="lines")
    # The day the page points at: a hairline, a dot on each line and the readout of all three.
    on_day = groups.transform_filter("datum.offset === day")
    rule = on_day.mark_rule(clip=True, aria=False).encode(x=x)
    readout = (
        on_day.mark_point(clip=True, aria=False)
        .encode(
            x=x,
            y=y,
            color=colour,
            tooltip=[alt.Tooltip("day:N", title="Day"), *[alt.Tooltip(f"{key}:Q", title=label, format=".2f") for key, label in SERIES]],
        )
        .properties(name="readout")
    )

    return (
        alt.layer(week, week_label, change, change_label, ordinary, lines, rule, readout)
        .add_params(day)
        .properties(
            width=WIDTH,
            height=HEIGHT,
            description=DESCRIPTION,
            usermeta={
                "generator": "charts/dst_days.py",
                "rows": ["rows"],
                "live": {"pick": {"mark": "lines_marks", "by": "x", "signal": "day", "key": "offset", "readout": "readout_marks"}},
            },
        )
    )
