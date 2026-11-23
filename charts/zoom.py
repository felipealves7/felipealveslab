"""A part of a whole, then that part split: two full-width bars, the second a zoom into one slice of
the first, joined by lines from the slice's edges to the second bar's ends. Used for the week of
public tenders on the Sinalvo case study: every notice, then the energy notices by procurement type.

The page builds the rows (src/lib/charts/sinalvo.mjs):
- one per segment: `step` (1 or 2), `key`, `start` and `end` (shares of the bar, 0 to 1), `tone`
  ("base", "focus" or "muted") and the `readout`, written by the page;
- `caption`, and optionally `value`, on the first segment of each step: the line of text above the
  first bar and below the second;
- `zoomFrom` and `zoomTo` on the focus segment of step 1: the slice the second bar opens up.
"""

import altair as alt

import theme

NAME = "zoom"
STEP = 64
BAR = 16


def chart() -> alt.LayerChart:
    active = alt.param(name="active", value=None)
    rows = alt.Chart(theme.rows())
    y = alt.Y("step:O", axis=None, scale=alt.Scale(paddingInner=0, paddingOuter=0))
    x = alt.X("start:Q", axis=None, scale=alt.Scale(domain=[0, 1], nice=False, zero=True))
    lead = -STEP / 2 + 9

    bars = (
        rows.mark_bar(size=BAR, aria=False, tooltip=alt.ExprRef("datum.readout"))
        .encode(
            x=x,
            x2="end:Q",
            y=y,
            color=alt.Color("tone:N", scale=alt.Scale(domain=["base", "focus", "muted"], range=[theme.SAND, theme.INK, theme.PALE]), legend=None),
            stroke=alt.condition("datum.key === active", alt.value(theme.INK), alt.value(theme.CREAM)),
            strokeWidth=alt.condition("datum.key === active", alt.value(2), alt.value(1)),
        )
        .properties(name="segments")
    )
    # The first bar's line sits above it and the second's below it, so the lines between the two
    # bars cross no text.
    def line(step_filter: str, dy: float) -> list:
        captions = rows.transform_filter(f"datum.caption && {step_filter}")
        text = captions.mark_text(align="left", baseline="middle", dy=dy, fontWeight=600, aria=False).encode(x=alt.datum(0), y=y, text="caption:N")
        value = captions.transform_filter("datum.value").mark_text(align="right", baseline="middle", dy=dy, fontWeight=600, aria=False).encode(x=alt.datum(1), y=y, text="value:N")
        return [text, value]

    # The slice's edges, joined to the ends of the bar below.
    zoom = (
        rows.transform_filter("isValid(datum.zoomFrom)")
        .transform_fold(["zoomFrom", "zoomTo"], as_=["edge", "at"])
        .transform_calculate(top="datum.step", bottom="datum.step + 1", to="datum.edge === 'zoomFrom' ? 0 : 1")
        .mark_rule(color=theme.INK, opacity=0.35, strokeWidth=1, yOffset=BAR / 2, y2Offset=-(BAR / 2), aria=False)
        .encode(
            x=alt.X("at:Q", axis=None, scale=alt.Scale(domain=[0, 1])),
            x2="to:Q",
            y=alt.Y("top:O", axis=None),
            y2="bottom:O",
        )
    )

    return (
        alt.layer(zoom, bars, *line("datum.step === 1", lead), *line("datum.step > 1", -lead))
        .add_params(active)
        .properties(
            width=600,
            height=alt.Step(STEP),
            description="Two bars: every notice in the week, with the energy notices as a slice, then the energy notices split by procurement type. The table under the chart lists every count.",
            usermeta={
                "generator": "charts/zoom.py",
                "rows": ["rows"],
                "live": {"pick": {"mark": "segments_marks", "by": "xy", "signal": "active", "key": "key"}},
            },
        )
    )
