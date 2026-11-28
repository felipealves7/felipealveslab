"""Download the flight-reliability package from Kaggle and check it against this repository.

The package is the public Kaggle dataset behind /lab/aviation-reliability. This script downloads one
version of it, signed out, and checks two things:

- every source file listed in data/aviation-reliability/source-code-checksums.json has that SHA-256;
- every copy kept in data/aviation-reliability/ is byte for byte the package's own file.

Nothing downloaded is run or imported: files are only read and hashed.

    python pipelines/aviation-reliability/fetch_package.py                   # download Version 3, check
    python pipelines/aviation-reliability/fetch_package.py --download-dir D  # the same, and keep it in D
    python pipelines/aviation-reliability/fetch_package.py --package-dir D   # check a download in D

Exit code 0 when everything matches, 1 when anything differs, is missing or is refused.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
from pathlib import Path, PurePosixPath
from typing import Callable

DATASET = "felipealves7/aviation-reliability-bts-foundation-v1"
VERSION = 3
PACKAGE_ROOT = PurePosixPath("projects/aviation-reliability")

REPO = Path(__file__).resolve().parents[2]
DATA_DIR = REPO / "data" / "aviation-reliability"
CHECKSUMS = "source-code-checksums.json"

# Files in data/aviation-reliability/ that were written here, not copied from the package.
NOT_FROM_PACKAGE = frozenset({"README.md", "external.json"})

# Every other file in data/aviation-reliability/, and where the package keeps the original.
REPO_COPIES = {
    "mart_month.csv": "data/curated/mart_month.csv",
    "delay_histogram.csv": "data/curated/delay_histogram.csv",
    "cached-results.json": "embeds/cached-results.json",
    "analysis-results.json": "evidence/analysis-results.json",
    "independent-raw-totals.json": "evidence/independent-raw-totals.json",
    "validation-summary.json": "evidence/validation-summary.json",
    "source-manifest.json": "evidence/source-manifest.json",
    "metric-contract.json": "metric-contract.json",
    "source-code-checksums.json": "evidence/source-code-checksums.json",
    "code/download.py": "scripts/download.py",
    "code/ingest.py": "scripts/ingest.py",
    "code/fct_flights.sql": "dbt/models/marts/fct_flights.sql",
    "code/mart_month.sql": "dbt/models/marts/mart_month.sql",
    "code/stg_flights.sql": "dbt/models/staging/stg_flights.sql",
    "code/mart_reconciliation.sql": "dbt/tests/mart_reconciliation.sql",
    "code/status_partition.sql": "dbt/tests/status_partition.sql",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_plain(rel: str) -> bool:
    """True for a relative path such as 'scripts/ingest.py': no root, no '..', no backslash."""
    if not rel or "\\" in rel:
        return False
    parts = PurePosixPath(rel).parts
    return not PurePosixPath(rel).is_absolute() and ".." not in parts and "." not in parts and str(PurePosixPath(rel)) == rel


def safe_file(root: Path, rel: str) -> Path | None:
    """The regular file at rel under root, or None.

    None when rel is not a plain relative path, when anything on the way is a symbolic link, when the
    path leaves root, or when there is no regular file there. A download is data, so a link that
    points elsewhere is refused rather than followed.
    """
    if not is_plain(rel):
        return None
    path = root
    for part in PurePosixPath(rel).parts:
        path = path / part
        if path.is_symlink():
            return None
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return None
    return path if path.is_file() else None


def files_under(root: Path) -> list[str]:
    return sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file() and not p.is_symlink())


def check(package: Path, data_dir: Path = DATA_DIR, copies: dict[str, str] = REPO_COPIES,
          not_from_package: frozenset[str] = NOT_FROM_PACKAGE) -> dict:
    """Compare the package rooted at `package` with the checksums and copies in `data_dir`."""
    listed = json.loads((data_dir / CHECKSUMS).read_text(encoding="utf-8"))
    sources = []
    for entry in listed:
        rel, expected = entry["path"], entry["sha256"]
        found = safe_file(package, rel)
        if not is_plain(rel):
            status = "refused path"
        elif found is None:
            status = "missing"
        else:
            status = "match" if sha256(found) == expected else "differs"
        sources.append({"path": rel, "status": status})

    kept = []
    for name, in_package in copies.items():
        mine, theirs = data_dir / name, safe_file(package, in_package)
        if not mine.is_file():
            status = "missing here"
        elif theirs is None:
            status = "missing in package"
        else:
            status = "match" if sha256(mine) == sha256(theirs) else "differs"
        kept.append({"file": name, "package_path": in_package, "status": status})

    unmapped = [f for f in files_under(data_dir) if f not in copies and f not in not_from_package]
    ok = (all(s["status"] == "match" for s in sources) and all(c["status"] == "match" for c in kept)
          and not unmapped)
    return {"ok": ok, "sources": sources, "copies": kept, "unmapped": unmapped,
            "package_files": len(files_under(package))}


def summary(report: dict, version: int | None) -> str:
    """The run's result as Markdown, for the workflow's step summary."""
    s_ok = sum(s["status"] == "match" for s in report["sources"])
    c_ok = sum(c["status"] == "match" for c in report["copies"])
    title = f"Kaggle Version {version}" if version else "a local download"
    lines = [
        f"### Flight package check: {title}",
        "",
        f"- Source files: {s_ok} of {len(report['sources'])} match `{CHECKSUMS}`.",
        f"- Copies in `data/aviation-reliability/`: {c_ok} of {len(report['copies'])} match the package.",
        f"- The package holds {report['package_files']} files. None of them was run.",
    ]
    problems = [(s["path"], s["status"]) for s in report["sources"] if s["status"] != "match"]
    problems += [(c["file"], c["status"]) for c in report["copies"] if c["status"] != "match"]
    problems += [(f, "copy with no package path in fetch_package.py") for f in report["unmapped"]]
    if problems:
        lines += ["", "| File | Status |", "| --- | --- |"] + [f"| `{f}` | {why} |" for f, why in problems]
    return "\n".join(lines) + "\n"


def download(version: int, dest: Path, downloader: Callable[..., str] | None = None) -> Path:
    """Download one version of the dataset into dest, signed out, and return the package root."""
    if downloader is None:
        import kagglehub  # imported here so the checks and their tests need no network or package
        downloader = kagglehub.dataset_download
    dataset_root = Path(downloader(f"{DATASET}/versions/{version}", output_dir=str(dest)))
    return dataset_root / PACKAGE_ROOT


def main(argv: list[str] | None = None, downloader: Callable[..., str] | None = None,
         data_dir: Path = DATA_DIR, copies: dict[str, str] = REPO_COPIES) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--version", type=int, default=VERSION, help=f"Kaggle dataset version (default {VERSION})")
    where = parser.add_mutually_exclusive_group()
    where.add_argument("--package-dir", type=Path,
                       help="check a download already in this folder instead of downloading")
    where.add_argument("--download-dir", type=Path,
                       help="download into this folder and keep it (default: a temporary folder, removed after)")
    parser.add_argument("--summary", type=Path, help="append the Markdown result to this file")
    parser.add_argument("--report", type=Path, help="write the full result as JSON to this file")
    args = parser.parse_args(argv)
    if args.version < 1:
        parser.error("--version must be 1 or more")

    def run(package: Path, version: int | None) -> int:
        if not package.is_dir():
            print(f"No {PACKAGE_ROOT} folder in the download: the package layout has changed.", file=sys.stderr)
            return 1
        report = check(package, data_dir, copies)
        report.update({"dataset": DATASET, "version": version})
        text = summary(report, version)
        print(text, end="")
        if args.summary:
            with args.summary.open("a", encoding="utf-8") as handle:
                handle.write(text)
        if args.report:
            args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        return 0 if report["ok"] else 1

    if args.package_dir:
        return run(args.package_dir / PACKAGE_ROOT, None)
    if args.download_dir:
        return run(download(args.version, args.download_dir, downloader), args.version)
    with tempfile.TemporaryDirectory(prefix="flight-package-") as tmp:
        return run(download(args.version, Path(tmp), downloader), args.version)


if __name__ == "__main__":
    sys.exit(main())
