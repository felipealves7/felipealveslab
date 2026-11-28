"""The lockdown and power-load metrics, asked through MetricFlow, must give the figures that
pipelines/power-lockdown/analyse.mjs computes in JavaScript from the same raw files.

The two are independent implementations: dbt SQL on DuckDB here, plain Node there. dbt's own data
tests (run by the build) check the bridge: weights sum to one in every subsystem on every day, every
subsystem has a value every day, and no hour of load is counted twice.
Run from the repository root: python -m unittest discover -s pipelines/semantic-layer
"""

import datetime as dt
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))

from semantic_query import SemanticLayer  # noqa: E402

RESULTS = json.loads((REPO / "data" / "power-lockdown" / "results.json").read_text(encoding="utf-8"))
NAMES = {"N": "North", "NE": "Northeast", "S": "South", "SE": "Southeast/Centre-West"}


def day(iso: str) -> dt.datetime:
    return dt.datetime.fromisoformat(iso)


class PowerLockdownTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # rebuild=True runs dbt build: every model and every data test, or it raises.
        cls.engine = SemanticLayer.open(rebuild=True)._engine

    def ask(self, metrics, group_by=(), start=None, end=None):
        from metricflow.engine.metricflow_engine import MetricFlowQueryRequest  # noqa: PLC0415

        request = MetricFlowQueryRequest.create(
            metric_names=list(metrics),
            group_by_names=list(group_by),
            time_constraint_start=day(start) if start else None,
            time_constraint_end=day(end) if end else None,
            order_by_names=list(group_by) or None,
        )
        table = self.engine.query(mf_request=request).result_df
        return [[table.get_cell_value(r, c) for c in range(table.column_count)] for r in range(table.row_count)]

    def test_april_by_subsystem_matches_the_pipeline(self):
        rows = self.ask(["load_change_pct", "stringency"], ["subsystem__subsystem_name"], "2020-04-01", "2020-04-30")
        got = {name: (float(change), float(s)) for name, change, s in rows}
        self.assertEqual(len(got), 4)
        for a in RESULTS["april"]:
            change, stringency = got[NAMES[a["subsystem"]]]
            self.assertAlmostEqual(round(change, 2), a["load_fall_pct"], places=9, msg=a["subsystem"])
            self.assertAlmostEqual(round(stringency, 1), a["stringency_capacity"], places=9, msg=a["subsystem"])

    def test_the_lockdown_window_for_brazil_matches_the_pipeline(self):
        window = RESULTS["levels"]["BR"]["window"]
        [[change]] = self.ask(["load_change_pct"], [], window["from"], window["to"])
        self.assertAlmostEqual(round(float(change), 2), window["fall_pct"], places=9)

    def test_the_answer_changes_with_the_level_of_detail(self):
        # The same weeks give a deeper fall at the week level than at the month or the whole window.
        weeks = self.ask(["load_change_pct"], ["metric_time__week"], "2020-03-16", "2020-06-30")
        months = self.ask(["load_change_pct"], ["metric_time__month"], "2020-03-01", "2020-06-30")
        deepest_week = min(float(r[1]) for r in weeks)
        deepest_month = min(float(r[1]) for r in months)
        window = RESULTS["levels"]["BR"]["window"]["fall_pct"]
        self.assertLess(deepest_week, deepest_month)
        self.assertLess(deepest_month, window)

    def test_ibcbr_quarter_is_the_mean_of_its_months(self):
        months = self.ask(["ibcbr"], ["metric_time__month"], "2020-04-01", "2020-06-30")
        [[_, quarter]] = self.ask(["ibcbr"], ["metric_time__quarter"], "2020-04-01", "2020-06-30")
        self.assertAlmostEqual(float(quarter), sum(float(r[1]) for r in months) / 3, places=9)


if __name__ == "__main__":
    unittest.main()
