"""Write each chart's Vega-Lite spec to src/charts/<name>.vl.json, where the site build reads it.

    python3 charts/build.py           write the specs
    python3 charts/build.py --check   exit 1 if a saved spec differs from what the code makes
"""

import json
import sys
from pathlib import Path

import altair as alt

import aviation_delays
import aviation_months
import checks
import dst_days
import pld_daily
import zoom
from bars import Bars, BarsChange

CHARTS = [pld_daily, dst_days, aviation_months, aviation_delays, Bars, BarsChange, checks, zoom]
OUT = Path(__file__).resolve().parent.parent / "src" / "charts"


def spec_text(module) -> str:
    spec = module.chart().to_dict()  # validates against the Vega-Lite schema
    spec["usermeta"]["altair"] = alt.__version__
    return json.dumps(spec, indent=1, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    check = "--check" in argv
    stale = []
    OUT.mkdir(parents=True, exist_ok=True)
    for module in CHARTS:
        path = OUT / f"{module.NAME}.vl.json"
        text = spec_text(module)
        if check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(path.name)
        else:
            path.write_text(text, encoding="utf-8")
            print(f"wrote {path.relative_to(OUT.parent.parent)}")
    if stale:
        print("Out of date, run python3 charts/build.py: " + ", ".join(stale))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
