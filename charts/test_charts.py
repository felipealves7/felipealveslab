"""Checks for the Altair charts. Run from the repository root:

    python3 -m unittest discover -s charts
"""

import json
import unittest
from pathlib import Path

import altair as alt

import build
import theme

ROOT = Path(__file__).resolve().parent.parent


def saved(module) -> dict:
    return json.loads((ROOT / "src" / "charts" / f"{module.NAME}.vl.json").read_text(encoding="utf-8"))


def names(spec: dict) -> set:
    """Every view name in a spec, at any depth: the marks the page picks from are named views."""
    found = set()

    def walk(node):
        if isinstance(node, dict):
            if isinstance(node.get("name"), str):
                found.add(node["name"])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(spec)
    return found


def inline_values(spec: dict) -> list:
    """The inline rows of every data source in a spec (axis tick lists are not data)."""
    found = []

    def walk(node):
        if isinstance(node, dict):
            data = node.get("data")
            if isinstance(data, dict) and isinstance(data.get("values"), list):
                found.append(data["values"])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(spec)
    return found


class SavedSpecs(unittest.TestCase):
    def test_saved_specs_are_what_the_code_makes(self):
        self.assertEqual(build.main(["--check"]), 0)

    def test_every_chart_reads_a_served_file_or_rows_the_page_builds(self):
        for module in build.CHARTS:
            spec = saved(module)
            # No figures are written into a spec: inline data is at most the one empty row a label or a
            # line is drawn from.
            self.assertTrue(all(len(v) <= 1 and v[0] == {} for v in inline_values(spec)), module.NAME)
            if "rows" in spec["usermeta"]:
                for name in spec["usermeta"]["rows"]:
                    self.assertIn(f'"name": "{name}"', json.dumps(spec), module.NAME)
            else:
                url = spec["data"]["url"]
                self.assertTrue(url.startswith("/data/"), url)
                self.assertTrue((ROOT / "public" / url.lstrip("/")).is_file(), url)


class Theme(unittest.TestCase):
    def test_theme_is_registered_and_on(self):
        self.assertEqual(alt.theme.active, "felipealveslab")
        for module in build.CHARTS:
            config = saved(module)["config"]
            self.assertEqual(config["background"], theme.CREAM, module.NAME)
            self.assertEqual(config["font"], theme.SANS, module.NAME)
            self.assertEqual(config["range"]["category"], theme.SERIES, module.NAME)
            self.assertEqual(config["axisY"]["minExtent"], config["axisY"]["maxExtent"], module.NAME)

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


class Live(unittest.TestCase):
    def test_what_the_page_sets_is_in_the_chart(self):
        for module in build.CHARTS:
            spec = saved(module)
            live = spec["usermeta"].get("live", {})
            params = {p["name"] for p in spec.get("params", [])}
            for name in live.get("params", []):
                self.assertIn(name, params, module.NAME)
            pick = live.get("pick")
            if pick:
                self.assertIn(pick["mark"].removesuffix("_marks"), names(spec), module.NAME)
                self.assertIn(pick["signal"], params, module.NAME)
                if "readout" in pick:
                    self.assertIn(pick["readout"].removesuffix("_marks"), names(spec), module.NAME)


if __name__ == "__main__":
    unittest.main()
