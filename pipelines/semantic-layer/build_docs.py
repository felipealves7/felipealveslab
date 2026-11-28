"""Build the semantic layer's dbt docs as one static page and copy it to the site.

    python pipelines/semantic-layer/build_docs.py

Runs dbt build (every model and data test) and dbt docs generate --static from this folder, with
relative paths, so no path from the machine that built it reaches the page. Writes
public/lab-docs/semantic-layer/index.html, which the lockdown and power-load lab embeds.
"""

import os
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
OUT = REPO / "public" / "lab-docs" / "semantic-layer" / "index.html"


def main() -> int:
    os.chdir(HERE)
    env = {
        "LAB_DUCKDB_PATH": "target/lab.duckdb",
        "LAB_LEDGER_PARQUET": "target/ledger.parquet",
        "LAB_POWER_DATA": "../../data/power-lockdown",
        "DBT_SEND_ANONYMOUS_USAGE_STATS": "false",
        "DO_NOT_TRACK": "1",
    }
    os.environ.update(env)
    sys.path.insert(0, str(HERE))
    from build_ledger import build as build_parquet  # noqa: PLC0415
    from dbt.cli.main import dbtRunner  # noqa: PLC0415

    build_parquet(HERE / env["LAB_LEDGER_PARQUET"])
    runner = dbtRunner()
    for args in (["build"], ["docs", "generate", "--static"]):
        result = runner.invoke([*args, "--project-dir", ".", "--profiles-dir", ".", "--quiet"])
        if not result.success:
            print(f"dbt {' '.join(args)} failed: {result.exception or result.result}")
            return 1
    page = (HERE / "target" / "static_index.html").read_text(encoding="utf-8")
    leaked = sorted(set(re.findall(r"/(?:home|Users|tmp|root)/[\w./-]+", page)))
    if leaked:
        print("The docs carry local paths: " + ", ".join(leaked[:5]))
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(HERE / "target" / "static_index.html", OUT)
    print(f"wrote {OUT.relative_to(REPO)} ({OUT.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
