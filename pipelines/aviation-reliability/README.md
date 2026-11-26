# aviation-reliability

The flight-reliability project behind `/lab/aviation-reliability`. Its first step here is the fetch:
`fetch_package.py` downloads the public package from Kaggle and checks it against
`data/aviation-reliability/`.

## What the check does

- Downloads Version 3 of the Kaggle dataset
  [`felipealves7/aviation-reliability-bts-foundation-v1`](https://www.kaggle.com/datasets/felipealves7/aviation-reliability-bts-foundation-v1)
  with [kagglehub](https://github.com/Kaggle/kagglehub), signed out. The dataset is public, and
  kagglehub needs sign-in only for private data or data that asks for consent.
- Checks the 34 source files listed in `data/aviation-reliability/source-code-checksums.json`
  against their SHA-256.
- Checks the 16 copies in `data/aviation-reliability/` against the package's own files, byte for
  byte. `REPO_COPIES` in `fetch_package.py` says where the package keeps each one, and a new file in
  that folder fails the check until it has an entry there.
- Writes the result as Markdown (`--summary`) and JSON (`--report`). Exit code 0 when everything
  matches; 1 when anything differs, is missing or is refused.

Nothing downloaded is run or imported: files are only read and hashed. A listed path that could
leave the package is refused, and so is any symbolic link.

## Run it

```sh
pip install -r pipelines/aviation-reliability/requirements.txt
python pipelines/aviation-reliability/fetch_package.py                   # download Version 3, check, delete
python pipelines/aviation-reliability/fetch_package.py --download-dir D  # the same, and keep it in D
python pipelines/aviation-reliability/fetch_package.py --package-dir D   # check a download already in D
```

The `flight-package` workflow runs the tests and the check on pull requests and merges that change
this folder, `data/aviation-reliability/` or the workflow, and by hand from the Actions tab or the
GitHub app, where another version of the dataset can be checked.

Tests, with no network: `python -m unittest discover -s pipelines/aviation-reliability`.

## Result on 26 November 2026

Version 3 holds 125 files. 34 of 34 source files and 16 of 16 copies matched.
