"""The semantic layer must give the same answers as the Ask the Ledger gold set.

Every benchmark case with a scope (34 legacy questions and 10 validation questions) is asked through
MetricFlow and compared with the answer the suites compute from raw account names in JavaScript.
Run from the repository root: python -m unittest discover -s pipelines/semantic-layer
"""

import json
import math
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))

import duckdb  # noqa: E402

from semantic_query import SemanticLayer, SemanticLayerError  # noqa: E402


def node_json(*args: str):
    out = subprocess.run(
        ["node", str(HERE / "export_cases.mjs"), *args], cwd=REPO, check=True, capture_output=True, text=True
    )
    return json.loads(out.stdout)


def js_round(value: float, decimals: int = 0) -> float:
    """Math.round, which rounds halves up, to the same decimals the gold set uses."""
    scale = 10**decimals
    return math.floor(value * scale + 0.5) / scale


GROUP = {"entity": "company", "month": "month", "quarter": "quarter"}


def ask(layer: SemanticLayer, spec: dict):
    """Turn one benchmark scope into a semantic-layer query and the gold set's answer shape."""
    metric = spec["metric"]
    group = GROUP.get(spec.get("groupBy"))
    filters = []
    if spec.get("entity"):
        filters.append({"dimension": "company", "op": "=", "values": [spec["entity"]]})
    if spec.get("exclude"):
        filters.append({"dimension": "company", "op": "!=", "values": [spec["exclude"]]})
    order, limit = [], None
    if spec.get("rank"):
        order = [("-" if spec["rank"]["dir"] == "desc" else "") + metric]
        limit = spec["rank"]["n"]
    result = layer.query(
        [metric],
        group_by=[group] if group else [],
        start_month=spec["from"],
        end_month=spec["to"],
        filters=filters,
        order_by=order,
        limit=limit,
        with_sql=False,
    )
    digits = 1 if metric == "gross_margin" else 0
    if not group:
        return {"kind": "scalar", "value": js_round(result.rows[0][0], digits)}
    label, value = result.columns.index(group), result.columns.index(metric)
    return {"kind": "table", "rows": [{"label": r[label], "value": js_round(r[value], digits)} for r in result.rows]}


class SemanticLayerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.layer = SemanticLayer.open(rebuild=True)
        cls.cases = [c for c in node_json() if c["spec"]]

    def test_parquet_holds_exactly_the_generated_ledger(self):
        generated = sorted(tuple(r) for r in node_json("--rows"))
        parquet = HERE / "target" / "ledger.parquet"
        stored = sorted(
            duckdb.sql(f"SELECT entity, month, account, account_group, amount FROM '{parquet.as_posix()}'").fetchall()
        )
        self.assertEqual(len(generated), 1008)
        self.assertEqual(stored, generated)

    def test_every_scoped_case_matches_the_gold_answer(self):
        self.assertEqual(len(self.cases), 44)
        for case in self.cases:
            with self.subTest(case=case["id"], text=case["text"]):
                got = ask(self.layer, case["spec"])
                want = case["expected"]
                if want["kind"] == "table" and not case["spec"].get("rank"):
                    self.assertEqual(sorted(got["rows"], key=lambda r: r["label"]), sorted(want["rows"], key=lambda r: r["label"]))
                else:
                    self.assertEqual(got, want)

    def test_margins_are_sums_first_then_divided(self):
        both = self.layer.query(["revenue", "cost_of_sales", "gross_margin"], start_month="2025-01", end_month="2025-12", with_sql=False)
        revenue, cost, margin = both.rows[0]
        self.assertAlmostEqual(margin, (revenue - cost) * 100 / revenue, places=9)
        by_company = self.layer.query(["gross_margin"], group_by=["company"], start_month="2025-01", end_month="2025-12", with_sql=False)
        average_of_margins = sum(r[1] for r in by_company.rows) / len(by_company.rows)
        self.assertNotAlmostEqual(margin, average_of_margins, places=3)

    def test_refuses_names_and_values_it_does_not_define(self):
        with self.assertRaisesRegex(SemanticLayerError, "Defined metrics"):
            self.layer.query(["ebitda"])
        with self.assertRaisesRegex(SemanticLayerError, "Use any of"):
            self.layer.query(["revenue"], group_by=["region"])
        with self.assertRaisesRegex(SemanticLayerError, "Valid values"):
            self.layer.query(["revenue"], filters=[{"dimension": "company", "op": "=", "values": ["Acme Air"]}])
        with self.assertRaisesRegex(SemanticLayerError, "YYYY-MM"):
            self.layer.query(["revenue"], start_month="March")
        with self.assertRaisesRegex(SemanticLayerError, "limit"):
            self.layer.query(["revenue"], group_by=["company"], limit=0)
        with self.assertRaisesRegex(SemanticLayerError, "more than 200 rows"):
            self.layer.query(["revenue"], group_by=["company", "account", "month"], with_sql=False)

    def test_answers_carry_their_definitions_and_sql(self):
        result = self.layer.query(["gross_profit"], group_by=["quarter"], start_month="2026-01", end_month="2026-09")
        self.assertEqual([r[0] for r in result.rows], ["2026-Q1", "2026-Q2", "2026-Q3"])
        self.assertEqual(result.metrics[0]["description"], "Revenue minus cost of sales.")
        self.assertIn("fct_ledger", result.sql)


if __name__ == "__main__":
    unittest.main()
