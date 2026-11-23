"""The site's bar chart: one bar per row, its label above it and its value at the right, over a pale
track that shows the whole scale. Used for model scores, outcomes, yearly means, sectors and
payment shares, so every bar on the site reads the same way.

The page builds the rows (src/lib/charts/bars.mjs):
- `key`, `order` and `label`;
- `value`, the bar's length, and `scaleMax`, the length of the whole track;
- `text`, the value as printed, and `readout`, the tooltip, both written by the page;
- `focus`, true for a row the page stands out in ink;
- optional `lo` and `hi`, a range drawn across the bar, such as the spread behind a mean.

"bars-change" is the same design for signed changes: bars run left or right of a centre line on a
scale from -scaleMax to scaleMax.
"""

import altair as alt

import theme

STEP = 38  # each row: a line for the label and value, then the bar
BAR = 12


def chart(signed: bool = False) -> alt.LayerChart:
    active = alt.param(name="active", value=None)
    rows = alt.Chart(theme.rows()).transform_calculate(start="-datum.scaleMax" if signed else "0", zero="0")
    one = alt.Chart(alt.Data(values=[{}]))
    y = alt.Y("key:N", sort=alt.EncodingSortField(field="order", op="min"), axis=None, scale=alt.Scale(paddingInner=0, paddingOuter=0))
    scale = alt.Scale(nice=False, zero=True)

    def at(field: str) -> alt.X:
        return alt.X(f"{field}:Q", axis=None, scale=scale, title=None)

    lead = -STEP / 2 + 3  # from the middle of a row up to its line of text
    ink = "datum.key === active || datum.focus"
    track = rows.mark_bar(color=theme.TRACK, size=BAR, cornerRadius=3, aria=False).encode(x=at("start"), x2="scaleMax:Q", y=y)
    bars = (
        rows.mark_bar(size=BAR, cornerRadius=3, aria=False, tooltip=alt.ExprRef("datum.readout"))
        .encode(x=at("zero"), x2="value:Q", y=y, color=alt.condition(ink, alt.value(theme.INK), alt.value(theme.DATA)))
        .properties(name="bars")
    )
    spread = rows.transform_filter("isValid(datum.lo) && isValid(datum.hi)")
    spread_line = spread.mark_rule(color=theme.INK, strokeWidth=2, opacity=1, aria=False).encode(x=at("lo"), x2="hi:Q", y=y)
    spread_ends = (
        spread.transform_fold(["lo", "hi"], as_=["end", "at"])
        .mark_tick(color=theme.INK, thickness=2, size=BAR + 6, opacity=1, aria=False)
        .encode(x=at("at"), y=y)
    )
    label = rows.mark_text(align="left", baseline="middle", dy=lead, fontWeight=600, aria=False).encode(x=at("start"), y=y, text="label:N")
    value = rows.mark_text(align="right", baseline="middle", dy=lead, fontWeight=600, aria=False).encode(x=at("scaleMax"), y=y, text="text:N")
    layers = [track, bars, spread_line, spread_ends, label, value]
    if signed:
        layers.insert(1, one.mark_rule(color=theme.BASELINE, opacity=1, aria=False).encode(x=alt.XDatum(0, axis=None)))

    return (
        alt.layer(*layers)
        .add_params(active)
        .properties(
            width=600,
            height=alt.Step(STEP),
            description="One bar per row, with its value printed at the right. The table under the chart lists every value.",
            usermeta={
                "generator": "charts/bars.py",
                "rows": ["rows"],
                "live": {"pick": {"mark": "bars_marks", "by": "y", "signal": "active", "key": "key"}},
            },
        )
    )


class Bars:
    NAME = "bars"
    chart = staticmethod(lambda: chart(signed=False))


class BarsChange:
    NAME = "bars-change"
    chart = staticmethod(lambda: chart(signed=True))
