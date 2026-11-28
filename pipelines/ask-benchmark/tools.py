"""The client-side tools the benchmark gives the model, and the code that runs them.

Every number these tools return is computed here, from the semantic layer or from a stored result.
The model only chooses what to ask; it never does the arithmetic itself.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "semantic-layer"))

from semantic_query import FILTER_DIMENSIONS, FILTER_OPS, GROUP_BYS, MAX_ROWS, SemanticLayerError  # noqa: E402

# Coverage of the synthetic ledger and the month in which its questions are asked
# (AS_OF and REPORT_MONTH in pipelines/ask-the-ledger/semantic.mjs).
LEDGER_FROM, LEDGER_TO, REPORT_MONTH = "2025-01", "2026-09", "2026-10"
RESULT_CHARS = 12_000  # what one tool result may send back to the model


class ToolError(Exception):
    """A tool call the model should fix and retry. The message is sent back to it."""


SUBMIT_ANSWER = {
    "name": "submit_answer",
    "description": (
        "Give your final answer. Call it exactly once, at the end. Use outcome 'decline' when the "
        "question is ambiguous, outside the data, or cannot be answered with the tools you have."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "outcome": {"type": "string", "enum": ["answer", "decline"]},
            "value": {"type": "number", "description": "The number, when the answer is one number."},
            "rows": {
                "type": "array",
                "description": "When the answer is a list or a table: one row per item, in the order asked for.",
                "items": {
                    "type": "object",
                    "properties": {"label": {"type": "string"}, "value": {"type": "number"}},
                    "required": ["label", "value"],
                },
            },
            "unit": {"type": "string"},
            "explanation": {"type": "string", "description": "One or two sentences: the definition, the period, and how you got the number."},
            "caveat": {"type": "string", "description": "What the answer cannot show, if anything."},
            "sources": {"type": "array", "items": {"type": "string"}, "description": "URLs or tool names the numbers came from."},
        },
        "required": ["outcome", "explanation"],
    },
}

LIST_METRICS = {
    "name": "list_metrics",
    "description": "List the ledger's defined metrics, the ways to group and filter them, and the months covered.",
    "input_schema": {"type": "object", "properties": {}},
}

QUERY_METRICS = {
    "name": "query_metrics",
    "description": (
        "Run one governed query on the ledger's semantic layer. You name metrics, groupings, a month "
        "range and filters; the semantic layer writes the SQL from the metric definitions and returns "
        "the rows, the definitions used and the SQL. Months are 'YYYY-MM' and both ends are included."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "metrics": {"type": "array", "items": {"type": "string"}, "minItems": 1},
            "group_by": {"type": "array", "items": {"type": "string", "enum": list(GROUP_BYS)}},
            "start_month": {"type": "string", "description": "First month, 'YYYY-MM'."},
            "end_month": {"type": "string", "description": "Last month, 'YYYY-MM'."},
            "filters": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "dimension": {"type": "string", "enum": list(FILTER_DIMENSIONS)},
                        "op": {"type": "string", "enum": list(FILTER_OPS)},
                        "values": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["dimension", "op", "values"],
                },
            },
            "order_by": {"type": "array", "items": {"type": "string"}, "description": "Metric or group_by names; prefix '-' for descending."},
            "limit": {"type": "integer", "minimum": 1, "maximum": MAX_ROWS},
        },
        "required": ["metrics"],
    },
}

COMPUTE = {
    "name": "compute",
    "description": (
        "Run an approved calculation on a stored result (each query_metrics result has a result_id). "
        "growth: the change from each row to the next, in %. correlation: Pearson's r between two "
        "columns, or between a column and one in another result matched on the first column. "
        "before_after: the mean before and from split_label on, and the difference; with "
        "control_column, the difference in differences."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "function": {"type": "string", "enum": ["growth", "correlation", "before_after"]},
            "result_id": {"type": "string"},
            "value_column": {"type": "string"},
            "other_column": {"type": "string", "description": "correlation: the second column."},
            "other_result_id": {"type": "string", "description": "correlation: take other_column from this result instead."},
            "split_label": {"type": "string", "description": "before_after: the first label of the after period."},
            "control_column": {"type": "string", "description": "before_after: a column for a group the change did not reach."},
        },
        "required": ["function", "result_id", "value_column"],
    },
}


def _round(v: float, places: int = 6) -> float:
    return float(round(v, places))


class Toolbox:
    """Runs the client tools of one setup for one question. Stored results live for that question only."""

    def __init__(self, layer=None, catalogue: list[dict] | None = None) -> None:
        self.layer = layer
        self.catalogue = catalogue or []
        self.results: dict[str, dict] = {}
        self.handlers: dict[str, Callable[[dict], Any]] = {
            "list_metrics": self.list_metrics,
            "query_metrics": self.query_metrics,
            "compute": self.compute,
        }

    def call(self, name: str, args: dict) -> tuple[str, bool]:
        """Run a tool. Returns the JSON text for the model and whether it is an error."""
        handler = self.handlers.get(name)
        if handler is None:
            return json.dumps({"error": f"No tool called {name!r} in this setup."}), True
        try:
            out = handler(args or {})
        except (ToolError, SemanticLayerError) as e:
            return json.dumps({"error": str(e)}), True
        text = json.dumps(out, default=str)
        if len(text) > RESULT_CHARS:
            return json.dumps({"error": f"The result is {len(text)} characters; narrow the query or add a limit."}), True
        return text, False

    # Semantic layer --------------------------------------------------------------------------
    def list_metrics(self, _args: dict) -> dict:
        return {
            "metrics": self.layer.describe_metrics(),
            "group_by": list(GROUP_BYS),
            "filters": {d: self.layer.dimension_values(d) for d in FILTER_DIMENSIONS},
            "months_covered": f"{LEDGER_FROM} to {LEDGER_TO}",
            "questions_asked_in": REPORT_MONTH,
            "units": "thousands of AED; gross_margin in %",
            "data": "synthetic: invented companies and amounts",
        }

    def query_metrics(self, args: dict) -> dict:
        result = self.layer.query(
            args.get("metrics") or [],
            group_by=args.get("group_by"),
            start_month=args.get("start_month"),
            end_month=args.get("end_month"),
            filters=args.get("filters"),
            order_by=args.get("order_by"),
            limit=args.get("limit"),
        )
        rid = f"r{len(self.results) + 1}"
        self.results[rid] = {"columns": result.columns, "rows": result.rows}
        if not result.rows:
            return {"result_id": rid, "rows": [], "note": "No rows: the ledger has no data for this scope."}
        return {"result_id": rid, **result.as_dict()}

    # Approved calculations -------------------------------------------------------------------
    def _column(self, rid: str, column: str) -> tuple[list[Any], list[float]]:
        if rid not in self.results:
            raise ToolError(f"No stored result {rid!r}. Stored: {', '.join(self.results) or 'none yet'}.")
        res = self.results[rid]
        if column not in res["columns"]:
            raise ToolError(f"Result {rid} has no column {column!r}. Columns: {', '.join(res['columns'])}.")
        c = res["columns"].index(column)
        labels = [r[0] for r in res["rows"]]
        values = [r[c] for r in res["rows"]]
        if any(not isinstance(v, (int, float)) for v in values):
            raise ToolError(f"Column {column!r} is not numeric.")
        return labels, [float(v) for v in values]

    def compute(self, args: dict) -> dict:
        fn, rid, col = args.get("function"), args.get("result_id"), args.get("value_column")
        labels, values = self._column(rid, col)
        if fn == "growth":
            if len(values) < 2:
                raise ToolError("growth needs at least two rows.")
            out = []
            for i in range(1, len(values)):
                prev = values[i - 1]
                out.append({"label": labels[i], "from": prev, "to": values[i], "growth_pct": None if prev == 0 else _round((values[i] / prev - 1) * 100)})
            return {"function": "growth", "column": col, "rows": out}
        if fn == "correlation":
            other = args.get("other_column")
            if not other:
                raise ToolError("correlation needs other_column.")
            if args.get("other_result_id"):
                other_labels, other_values = self._column(args["other_result_id"], other)
                lookup = dict(zip(other_labels, other_values))
                pairs = [(v, lookup[l]) for l, v in zip(labels, values) if l in lookup]
            else:
                _, other_values = self._column(rid, other)
                pairs = list(zip(values, other_values))
            if len(pairs) < 3:
                raise ToolError(f"correlation needs at least three matched rows; found {len(pairs)}.")
            xs, ys = zip(*pairs)
            mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
            sxy = sum((x - mx) * (y - my) for x, y in pairs)
            sxx, syy = sum((x - mx) ** 2 for x in xs), sum((y - my) ** 2 for y in ys)
            if sxx == 0 or syy == 0:
                raise ToolError("correlation is undefined: one column does not vary.")
            return {"function": "correlation", "r": _round(sxy / math.sqrt(sxx * syy)), "n": len(pairs), "note": "Correlation is not causation."}
        if fn == "before_after":
            split = args.get("split_label")
            if split not in labels:
                raise ToolError(f"split_label {split!r} is not a label in {rid}. Labels: {', '.join(map(str, labels))}.")
            k = labels.index(split)
            if k == 0:
                raise ToolError("split_label must leave at least one row before it.")

            def change(vs: list[float]) -> dict:
                before, after = sum(vs[:k]) / k, sum(vs[k:]) / (len(vs) - k)
                return {"mean_before": _round(before), "mean_after": _round(after), "difference": _round(after - before),
                        "difference_pct": None if before == 0 else _round((after / before - 1) * 100)}

            out = {"function": "before_after", "split_label": split, "rows_before": k, "rows_after": len(values) - k, "treated": change(values)}
            if args.get("control_column"):
                _, control = self._column(rid, args["control_column"])
                out["control"] = change(control)
                out["difference_in_differences"] = _round(out["treated"]["difference"] - out["control"]["difference"])
            return out
        raise ToolError(f"Unknown function {fn!r}. Use growth, correlation or before_after.")
