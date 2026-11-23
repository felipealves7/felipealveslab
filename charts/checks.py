"""The airport data contract: one square per check of a run, in contract order, ten to a row,
shaded by its result: passed, passed within its documented tolerance, or failed.

The page builds the rows from data/airport-contract/results.json (src/lib/charts/lab.mjs): `id`,
`order`, `col` and `row` (the square's place), `status` ("pass", "tolerated" or "fail") and the
readout for the check, written by the page. The squares keep one size at every width, so the
chart is not stretched to the column.
"""

import altair as alt

import theme

NAME = "checks"
CELL = 28  # a 24 px square and its gap: ten to a row fit a 305 px card
STATUS = ["pass", "tolerated", "fail"]
WORDS = "{'pass': 'passed', 'tolerated': 'within tolerance', 'fail': 'failed'}[datum.label]"


def chart() -> alt.Chart:
    active = alt.param(name="active", value=None)
    return (
        alt.Chart(theme.rows())
        .mark_rect(cornerRadius=3, aria=False, tooltip=alt.ExprRef("datum.readout"))
        .encode(
            x=alt.X("col:O", axis=None, scale=alt.Scale(paddingInner=0.16, paddingOuter=0)),
            y=alt.Y("row:O", axis=None, scale=alt.Scale(paddingInner=0.16, paddingOuter=0)),
            color=alt.Color(
                "status:N",
                scale=alt.Scale(domain=STATUS, range=[theme.PASS, theme.TOLERATED, theme.FAIL]),
                legend=alt.Legend(title=None, orient="bottom", direction="horizontal", symbolType="square", symbolSize=144, labelExpr=WORDS, columnPadding=16, offset=12),
            ),
            stroke=alt.condition("datum.id === active", alt.value(theme.INK), alt.value(theme.DATA)),
            strokeWidth=alt.condition("datum.id === active || datum.status === 'tolerated'", alt.value(2), alt.value(0)),
        )
        .add_params(active)
        .properties(
            name="cells",
            width=alt.Step(CELL),
            height=alt.Step(CELL),
            description="One square per contract check, in contract order: passed, within its documented tolerance, or failed. The table under the chart lists every check.",
            usermeta={
                "generator": "charts/checks.py",
                "rows": ["rows"],
                "live": {"width": False, "pick": {"mark": "cells_marks", "by": "xy", "signal": "active", "key": "id"}},
            },
        )
    )
