"""Checks for the Altair charts. Run from the repository root:

    python3 -m unittest discover -s charts
"""

import json
import unittest
from pathlib import Path

import altair as alt

import build
import pld_daily
import theme

ROOT = Path(__file__).resolve().parent.parent


class SavedSpecs(unittest.TestCase):
    def test_saved_specs_are_what_the_code_makes(self):
        self.assertEqual(build.main(["--check"]), 0)

    def test_every_chart_reads_a_file_the_site_serves(self):
        for module in build.CHARTS:
            spec = json.loads((ROOT / "src" / "charts" / f"{module.NAME}.vl.json").read_text(encoding="utf-8"))
            url = spec["data"]["url"]
            self.assertTrue(url.startswith("/data/"), url)
            self.assertTrue((ROOT / "public" / url.lstrip("/")).is_file(), url)
            self.assertNotIn('"values"', json.dumps(spec))


class Theme(unittest.TestCase):
    def test_theme_is_registered_and_on(self):
        self.assertEqual(alt.theme.active, "felipealveslab")
        config = pld_daily.chart().to_dict()["config"]
        self.assertEqual(config["background"], theme.CREAM)
        self.assertEqual(config["font"], theme.SANS)
        self.assertEqual(config["axisY"]["minExtent"], config["axisY"]["maxExtent"])

    def test_text_colours_meet_contrast_on_the_surface(self):
        def luminance(hex_colour):
            def channel(v):
                v /= 255
                return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

            r, g, b = (int(hex_colour[i : i + 2], 16) for i in (1, 3, 5))
            return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

        def ratio(a, b):
            hi, lo = sorted([luminance(a), luminance(b)], reverse=True)
            return (hi + 0.05) / (lo + 0.05)

        for colour in (theme.INK, theme.MUTED, theme.DATA):
            self.assertGreaterEqual(ratio(colour, theme.CREAM), 4.5, colour)


class PldDaily(unittest.TestCase):
    def test_live_names_match_named_layers(self):
        spec = pld_daily.chart().to_dict()
        live = spec["usermeta"]["live"]
        names = {layer.get("name") for layer in spec["spec"]["layer"]}
        for key in ("snap", "readout"):
            self.assertIn(live[key].removesuffix("_marks"), names)
        params = {p["name"] for p in spec["params"]}
        self.assertIn(live["day"], params)
        self.assertTrue(set(live["params"]) <= params)


if __name__ == "__main__":
    unittest.main()
