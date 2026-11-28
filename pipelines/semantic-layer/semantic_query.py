"""Ask the Lab's semantic layer questions through MetricFlow, in the same process.

A caller never writes SQL. It names metrics, groupings and filters from the lists this module
publishes, and MetricFlow writes the SQL from the definitions in models/. Unknown names and values
are refused with the list of valid ones, so a language model can correct itself.

    layer = SemanticLayer.open()          # builds the DuckDB file on first use
    layer.query(["revenue"], group_by=["company"], start_month="2025-01", end_month="2025-12")
"""

from __future__ import annotations

import calendar
import datetime as dt
import os
import sys
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable, Optional, Sequence

HERE = Path(__file__).resolve().parent
TARGET = HERE / "target"

# The names a caller may use, mapped to MetricFlow's own names.
GROUP_BYS = {
    "company": "ledger_line__company",
    "account": "ledger_line__account",
    "account_group": "ledger_line__account_group",
    "month": "metric_time__month",
    "quarter": "metric_time__quarter",
    "year": "metric_time__year",
}
FILTER_DIMENSIONS = {
    "company": "ledger_line__company",
    "account": "ledger_line__account",
    "account_group": "ledger_line__account_group",
}
FILTER_OPS = ("=", "!=", "in", "not in")
MAX_ROWS = 200


class SemanticLayerError(ValueError):
    """A request the semantic layer refuses. The message says what is valid instead."""


def _set_paths() -> None:
    os.environ.setdefault("LAB_DUCKDB_PATH", str(TARGET / "lab.duckdb"))
    os.environ.setdefault("LAB_LEDGER_PARQUET", str(TARGET / "ledger.parquet"))
    os.environ.setdefault("LAB_POWER_DATA", str(HERE.parents[1] / "data" / "power-lockdown"))
    os.environ.setdefault("DBT_SEND_ANONYMOUS_USAGE_STATS", "false")
    os.environ.setdefault("DO_NOT_TRACK", "1")


def build() -> None:
    """Write the ledger Parquet file, then build and test the dbt models into DuckDB."""
    _set_paths()
    if str(HERE) not in sys.path:
        sys.path.insert(0, str(HERE))
    from build_ledger import build as build_parquet  # noqa: PLC0415 (local module)
    from dbt.cli.main import dbtRunner  # noqa: PLC0415

    build_parquet(Path(os.environ["LAB_LEDGER_PARQUET"]))
    result = dbtRunner().invoke(
        ["build", "--project-dir", str(HERE), "--profiles-dir", str(HERE), "--quiet"]
    )
    if not result.success:
        raise RuntimeError(f"dbt build failed: {result.exception or result.result}")


def _month_bounds(start_month: Optional[str], end_month: Optional[str]):
    def parse(month: str, what: str) -> tuple[int, int]:
        try:
            y, m = (int(p) for p in month.split("-"))
            dt.date(y, m, 1)
        except (ValueError, AttributeError):
            raise SemanticLayerError(f"{what} must look like 'YYYY-MM', got {month!r}.") from None
        return y, m

    start = end = None
    if start_month:
        y, m = parse(start_month, "start_month")
        start = dt.datetime(y, m, 1)
    if end_month:
        y, m = parse(end_month, "end_month")
        end = dt.datetime(y, m, calendar.monthrange(y, m)[1])
    if start and end and start > end:
        raise SemanticLayerError("start_month is after end_month.")
    return start, end


def _plain(value: Any, column: str) -> Any:
    """Turn MetricFlow cell values into JSON-friendly ones with the Lab's labels."""
    if isinstance(value, (dt.datetime, dt.date)):
        if column == "quarter":
            return f"{value.year}-Q{(value.month - 1) // 3 + 1}"
        if column == "year":
            return str(value.year)
        if column == "month":
            return f"{value.year}-{value.month:02d}"
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


@dataclass
class QueryResult:
    columns: list[str]
    rows: list[list[Any]]
    sql: str = ""
    metrics: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {"columns": self.columns, "rows": self.rows, "definitions": self.metrics, "sql": self.sql}


class SemanticLayer:
    """MetricFlow over the Lab's dbt project, loaded once and queried many times."""

    def __init__(self, engine) -> None:
        self._engine = engine
        self._metrics = {m.name: m for m in engine.list_metrics()}
        self._values: dict[str, list[str]] = {}

    @classmethod
    def open(cls, rebuild: bool = False) -> "SemanticLayer":
        _set_paths()
        if rebuild or not (Path(os.environ["LAB_DUCKDB_PATH"]).exists() and (TARGET / "semantic_manifest.json").exists()):
            build()
        from dbt_metricflow.cli.cli_configuration import CLIConfiguration  # noqa: PLC0415

        cfg = CLIConfiguration()
        cfg.setup(dbt_profiles_path=HERE, dbt_project_path=HERE, configure_file_logging=False)
        return cls(cfg.mf)

    # What can be asked ---------------------------------------------------------------------
    def metric_names(self) -> list[str]:
        return sorted(self._metrics)

    def describe_metrics(self, names: Optional[Iterable[str]] = None) -> list[dict]:
        out = []
        for name in names or self.metric_names():
            m = self._metrics[name]
            out.append({"name": m.name, "label": m.label or m.name, "description": m.description or ""})
        return out

    def dimension_values(self, dimension: str) -> list[str]:
        if dimension not in FILTER_DIMENSIONS:
            raise SemanticLayerError(f"Unknown filter dimension {dimension!r}. Use one of: {', '.join(FILTER_DIMENSIONS)}.")
        if dimension not in self._values:
            values = self._engine.get_dimension_values(
                metric_names=["revenue"], get_group_by_values=FILTER_DIMENSIONS[dimension]
            )
            self._values[dimension] = sorted(str(v) for v in values)
        return self._values[dimension]

    # Asking ----------------------------------------------------------------------------------
    def _check(self, metrics, group_by, filters, order_by, limit) -> list[str]:
        if not metrics:
            raise SemanticLayerError(f"Name at least one metric: {', '.join(self.metric_names())}.")
        for name in metrics:
            if name not in self._metrics:
                raise SemanticLayerError(f"Unknown metric {name!r}. Defined metrics: {', '.join(self.metric_names())}.")
        for g in group_by:
            if g not in GROUP_BYS:
                raise SemanticLayerError(f"Unknown group_by {g!r}. Use any of: {', '.join(GROUP_BYS)}.")
        wheres = []
        for f in filters:
            dim, op, values = f.get("dimension"), str(f.get("op", "=")).lower(), f.get("values")
            if isinstance(values, str):
                values = [values]
            if op not in FILTER_OPS:
                raise SemanticLayerError(f"Unknown filter op {op!r}. Use one of: {', '.join(FILTER_OPS)}.")
            if not values:
                raise SemanticLayerError("A filter needs at least one value.")
            valid = self.dimension_values(dim)
            for v in values:
                if v not in valid:
                    raise SemanticLayerError(f"No {dim} called {v!r} in the data. Valid values: {', '.join(valid)}.")
            ref = f"{{{{ Dimension('{FILTER_DIMENSIONS[dim]}') }}}}"
            quoted = ", ".join("'" + v.replace("'", "''") + "'" for v in values)
            if op in ("=", "!=") and len(values) == 1:
                wheres.append(f"{ref} {'=' if op == '=' else '!='} {quoted}")
            else:
                wheres.append(f"{ref} {'IN' if op in ('=', 'in') else 'NOT IN'} ({quoted})")
        for o in order_by:
            if o.lstrip("-") not in set(metrics) | set(group_by):
                raise SemanticLayerError(f"order_by {o!r} must name a requested metric or group_by, with '-' for descending.")
        if limit is not None and (not isinstance(limit, int) or not 1 <= limit <= MAX_ROWS):
            raise SemanticLayerError(f"limit must be a whole number from 1 to {MAX_ROWS}.")
        return wheres

    def _request(self, metrics, group_by, start_month, end_month, filters, order_by, limit):
        from metricflow.engine.metricflow_engine import MetricFlowQueryRequest  # noqa: PLC0415

        metrics, group_by = list(metrics), list(group_by or [])
        filters, order_by = list(filters or []), list(order_by or [])
        wheres = self._check(metrics, group_by, filters, order_by, limit)
        start, end = _month_bounds(start_month, end_month)
        order = [("-" if o.startswith("-") else "") + GROUP_BYS.get(o.lstrip("-"), o.lstrip("-")) for o in order_by]
        if not order and group_by:  # a stable order when none is asked for
            order = [GROUP_BYS[g] for g in group_by]
        return metrics, group_by, MetricFlowQueryRequest.create(
            metric_names=metrics,
            group_by_names=[GROUP_BYS[g] for g in group_by],
            time_constraint_start=start,
            time_constraint_end=end,
            where_constraints=wheres or None,
            order_by_names=order or None,
            limit=limit if limit is not None else MAX_ROWS + 1,
        )

    def query(
        self,
        metrics: Sequence[str],
        group_by: Optional[Sequence[str]] = None,
        start_month: Optional[str] = None,
        end_month: Optional[str] = None,
        filters: Optional[Sequence[dict]] = None,
        order_by: Optional[Sequence[str]] = None,
        limit: Optional[int] = None,
        with_sql: bool = True,
    ) -> QueryResult:
        """Run one governed query. Raises SemanticLayerError for anything it cannot answer."""
        metrics, group_by, request = self._request(metrics, group_by, start_month, end_month, filters, order_by, limit)
        table = self._engine.query(mf_request=request).result_df
        if table.row_count > MAX_ROWS:
            raise SemanticLayerError(f"The answer has more than {MAX_ROWS} rows. Narrow the months, group by less, or set a limit.")
        names = list(table.column_names)
        friendly = {v: k for k, v in GROUP_BYS.items()}
        columns = [friendly.get(c, c) for c in names]
        rows = [
            [_plain(table.get_cell_value(r, c), columns[c]) for c in range(table.column_count)]
            for r in range(table.row_count)
        ]
        sql = ""
        if with_sql:
            sql = self._engine.explain(mf_request=request).sql_statement.without_descriptions.sql
        return QueryResult(columns=columns, rows=rows, sql=sql, metrics=self.describe_metrics(metrics))
