"""Tests for fetch_package.py. No network: downloads are faked, packages are small folders."""

import hashlib
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import fetch_package as fp


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


class Fixture:
    """A two-file package, its checksum list, and a data folder holding three copies from it."""

    def __init__(self, tmp: Path):
        self.tmp = tmp
        sources = {"scripts/ingest.py": b"print('ingest')\n", "dbt/models/marts/mart_month.sql": b"select 1\n"}
        self.listing = json.dumps([{"path": p, "sha256": sha(b)} for p, b in sources.items()], indent=2).encode()
        self.copies = {
            "mart_month.csv": "data/curated/mart_month.csv",
            "source-code-checksums.json": "evidence/source-code-checksums.json",
            "code/ingest.py": "scripts/ingest.py",
        }
        self.dataset = tmp / "download"
        self.package = self.dataset / fp.PACKAGE_ROOT
        for rel, data in {**sources, "data/curated/mart_month.csv": b"month,flights\n2026-08,1\n",
                          "evidence/source-code-checksums.json": self.listing}.items():
            write(self.package / rel, data)
        self.data = tmp / "data"
        for name, in_package in self.copies.items():
            write(self.data / name, (self.package / in_package).read_bytes())
        write(self.data / "README.md", b"# written here\n")
        write(self.data / "external.json", b"{}\n")

    def check(self) -> dict:
        return fp.check(self.package, self.data, self.copies)

    def main(self, *argv: str, downloader=None) -> tuple[int, str]:
        out = io.StringIO()
        with redirect_stdout(out), redirect_stderr(io.StringIO()):
            code = fp.main(list(argv), downloader, self.data, self.copies)
        return code, out.getvalue()


def statuses(rows: list[dict], key: str) -> dict[str, str]:
    return {row[key]: row["status"] for row in rows}


class CheckTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.f = Fixture(Path(self._tmp.name))

    def tearDown(self):
        self._tmp.cleanup()

    def test_everything_matches(self):
        report = self.f.check()
        self.assertTrue(report["ok"])
        self.assertEqual(set(statuses(report["sources"], "path").values()), {"match"})
        self.assertEqual(len(report["sources"]), 2)
        self.assertEqual(set(statuses(report["copies"], "file").values()), {"match"})
        self.assertEqual(len(report["copies"]), 3)
        self.assertEqual(report["unmapped"], [])
        self.assertEqual(report["package_files"], 4)

    def test_one_changed_byte_in_the_package_is_caught_twice(self):
        write(self.f.package / "scripts/ingest.py", b"print('ingesT')\n")
        report = self.f.check()
        self.assertFalse(report["ok"])
        self.assertEqual(statuses(report["sources"], "path")["scripts/ingest.py"], "differs")
        self.assertEqual(statuses(report["copies"], "file")["code/ingest.py"], "differs")

    def test_a_changed_copy_here_is_caught(self):
        write(self.f.data / "mart_month.csv", b"month,flights\n2026-08,2\n")
        report = self.f.check()
        self.assertFalse(report["ok"])
        self.assertEqual(statuses(report["copies"], "file")["mart_month.csv"], "differs")

    def test_missing_files_are_named_on_each_side(self):
        (self.f.package / "dbt/models/marts/mart_month.sql").unlink()
        (self.f.package / "data/curated/mart_month.csv").unlink()
        (self.f.data / "code/ingest.py").unlink()
        report = self.f.check()
        self.assertFalse(report["ok"])
        self.assertEqual(statuses(report["sources"], "path")["dbt/models/marts/mart_month.sql"], "missing")
        copies = statuses(report["copies"], "file")
        self.assertEqual(copies["mart_month.csv"], "missing in package")
        self.assertEqual(copies["code/ingest.py"], "missing here")

    def test_paths_that_could_leave_the_package_are_refused(self):
        outside = b"print('outside')\n"
        write(self.f.tmp / "download/projects/outside.py", outside)
        bad = ["../outside.py", "/etc/hostname", "scripts\\ingest.py", "./scripts/ingest.py", "scripts//ingest.py", ""]
        listing = [{"path": p, "sha256": sha(outside)} for p in bad]
        (self.f.data / "source-code-checksums.json").write_text(json.dumps(listing), encoding="utf-8")
        report = fp.check(self.f.package, self.f.data, {})
        self.assertEqual([s["status"] for s in report["sources"]], ["refused path"] * len(bad))
        self.assertFalse(report["ok"])

    @unittest.skipUnless(hasattr(os, "symlink"), "needs symbolic links")
    def test_symbolic_links_are_not_followed(self):
        target = self.f.tmp / "elsewhere/ingest.py"
        write(target, (self.f.package / "scripts/ingest.py").read_bytes())
        (self.f.package / "scripts/ingest.py").unlink()
        os.symlink(target, self.f.package / "scripts/ingest.py")
        real_dir = self.f.tmp / "elsewhere/marts"
        write(real_dir / "mart_month.sql", b"select 1\n")
        marts = self.f.package / "dbt/models/marts"
        (marts / "mart_month.sql").unlink()
        marts.rmdir()
        os.symlink(real_dir, marts, target_is_directory=True)
        sources = statuses(self.f.check()["sources"], "path")
        self.assertEqual(sources["scripts/ingest.py"], "missing")
        self.assertEqual(sources["dbt/models/marts/mart_month.sql"], "missing")

    @unittest.skipUnless(hasattr(os, "symlink"), "needs symbolic links")
    def test_a_link_inside_the_package_is_not_followed_either(self):
        ingest = self.f.package / "scripts/ingest.py"
        write(self.f.package / "spare/ingest.py", ingest.read_bytes())
        ingest.unlink()
        os.symlink(Path("../spare/ingest.py"), ingest)
        report = self.f.check()
        self.assertEqual(statuses(report["sources"], "path")["scripts/ingest.py"], "missing")
        self.assertEqual(statuses(report["copies"], "file")["code/ingest.py"], "missing in package")

    def test_a_new_file_here_needs_a_package_path(self):
        write(self.f.data / "new-table.csv", b"a\n1\n")
        report = self.f.check()
        self.assertFalse(report["ok"])
        self.assertEqual(report["unmapped"], ["new-table.csv"])

    def test_summary_gives_counts_and_names_each_problem(self):
        text = fp.summary(self.f.check(), 3)
        self.assertIn("Kaggle Version 3", text)
        self.assertIn("2 of 2 match", text)
        self.assertIn("3 of 3 match the package", text)
        self.assertIn("None of them was run", text)
        self.assertNotIn("| File |", text)
        write(self.f.data / "mart_month.csv", b"changed\n")
        text = fp.summary(self.f.check(), 3)
        self.assertIn("2 of 3 match the package", text)
        self.assertIn("| `mart_month.csv` | differs |", text)


class MainTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.f = Fixture(Path(self._tmp.name))

    def tearDown(self):
        self._tmp.cleanup()

    def test_exit_codes_summary_and_report(self):
        summary, report = self.f.tmp / "summary.md", self.f.tmp / "report.json"
        args = ("--package-dir", str(self.f.dataset), "--summary", str(summary), "--report", str(report))
        code, out = self.f.main(*args)
        self.assertEqual(code, 0)
        self.assertIn("a local download", out)
        self.assertTrue(json.loads(report.read_text())["ok"])
        write(self.f.package / "scripts/ingest.py", b"changed\n")
        code, _ = self.f.main(*args)
        self.assertEqual(code, 1)
        self.assertFalse(json.loads(report.read_text())["ok"])
        self.assertEqual(summary.read_text().count("### Flight package check"), 2)

    def test_a_download_without_the_package_folder_fails(self):
        empty = self.f.tmp / "empty"
        empty.mkdir()
        code, _ = self.f.main("--package-dir", str(empty))
        self.assertEqual(code, 1)

    def test_the_download_asks_for_the_pinned_version_and_is_removed_after(self):
        calls = []

        def fake_download(handle, output_dir):
            calls.append((handle, output_dir))
            for path in self.f.package.rglob("*"):
                if path.is_file():
                    write(Path(output_dir) / fp.PACKAGE_ROOT / path.relative_to(self.f.package), path.read_bytes())
            return output_dir

        code, out = self.f.main(downloader=fake_download)
        self.assertEqual(code, 0)
        self.assertIn("Kaggle Version 3", out)
        self.assertEqual(calls[0][0], "felipealves7/aviation-reliability-bts-foundation-v1/versions/3")
        self.assertFalse(Path(calls[0][1]).exists())

        kept = self.f.tmp / "kept"
        code, _ = self.f.main("--version", "4", "--download-dir", str(kept), downloader=fake_download)
        self.assertEqual(code, 0)
        self.assertEqual(calls[1], ("felipealves7/aviation-reliability-bts-foundation-v1/versions/4", str(kept)))
        self.assertTrue((kept / fp.PACKAGE_ROOT / "scripts/ingest.py").is_file())


class RepositoryTests(unittest.TestCase):
    """The real data/aviation-reliability/ folder, checked offline."""

    def setUp(self):
        self.listed = json.loads((fp.DATA_DIR / fp.CHECKSUMS).read_text(encoding="utf-8"))

    def test_the_checksum_list_has_34_plain_unique_paths(self):
        paths = [e["path"] for e in self.listed]
        self.assertEqual(len(paths), 34)
        self.assertEqual(len(set(paths)), 34)
        self.assertTrue(all(fp.is_plain(p) for p in paths))
        self.assertTrue(all(len(e["sha256"]) == 64 and set(e["sha256"]) <= set("0123456789abcdef") for e in self.listed))

    def test_every_copy_here_has_a_package_path(self):
        here = set(fp.files_under(fp.DATA_DIR)) - fp.NOT_FROM_PACKAGE
        self.assertEqual(here, set(fp.REPO_COPIES))
        self.assertTrue(all(fp.is_plain(p) for p in fp.REPO_COPIES.values()))

    def test_the_code_copies_map_to_their_listed_checksums(self):
        listed = {e["path"]: e["sha256"] for e in self.listed}
        code = {k: v for k, v in fp.REPO_COPIES.items() if k.startswith("code/")}
        self.assertEqual(len(code), 7)
        for name, in_package in code.items():
            with self.subTest(name=name):
                self.assertEqual(fp.sha256(fp.DATA_DIR / name), listed[in_package])


if __name__ == "__main__":
    unittest.main()
