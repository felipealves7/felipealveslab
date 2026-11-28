"""Write the synthetic Ask the Ledger rows to Parquet, the format the semantic layer reads.

The rows come from pipelines/ledger-api/schema.sql and seed.sql, the files that also load the live
D1 table, so the semantic layer and the live box answer from the same data.
"""

from pathlib import Path
import sys

import duckdb

HERE = Path(__file__).resolve().parent
LEDGER_API = HERE.parent / "ledger-api"


def build(out: Path = HERE / "target" / "ledger.parquet") -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute((LEDGER_API / "schema.sql").read_text())
    con.execute((LEDGER_API / "seed.sql").read_text())
    con.execute(f"COPY (SELECT * FROM ledger ORDER BY entity, month, account) TO '{out.as_posix()}' (FORMAT parquet)")
    rows = con.execute("SELECT count(*) FROM ledger").fetchone()[0]
    con.close()
    print(f"wrote {rows} rows to {out.relative_to(HERE)}")
    return out


if __name__ == "__main__":
    build(Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "target" / "ledger.parquet")
