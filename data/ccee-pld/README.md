# ccee-pld: contract runs, snapshots and page figures for the hourly PLD

Output of `pipelines/ccee-pld/run.mjs`, run on the raw files in `data/ccee-pld-horario/`.
A copy is served at `public/data/ccee-pld/results.json` for `/lab/brazil-power-price-contract`.

- **Source:** CCEE open data, dataset PLD_HORARIO, https://dadosabertos.ccee.org.br/dataset/pld_horario.
  Raw files, their retrieval date (14 November 2026) and hashes: `data/ccee-pld-horario/README.md`.
- **Licence:** Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/), as
  named on the dataset page, which also points to CCEE's site terms of use
  (https://www.ccee.org.br/web/guest/termos-de-uso, updated 13 October 2025). Attribution: Câmara de
  Comercialização de Energia Elétrica (CCEE). Changes: daily means and yearly figures are computed
  here from the hourly prices; the raw files are not changed.
- **Synthetic:** no. The made-up rows in `pipelines/ccee-pld/pld.test.mjs` are test fixtures only and
  are never written here.
- **Written:** 15 November 2026.

## results.json

| Key | What it holds |
| --- | --- |
| `source` | Name, URL, licence, attribution and unit of the source |
| `contract` | The 13 checks as written: id, scope, rule, columns read |
| `runs` | Every run, newest last: real runs and rehearsals, each check with bad of total and up to 3 examples, and the causes |
| `snapshots` | One per distinct download: file names, rows, bytes, SHA-256, and a SHA-256 fingerprint per month |
| `comparisons` | One per new snapshot after the first: months rewritten, added and gone; hour-level changes when run with `--previous` |
| `summary` | From the last passed real run: daily mean price per submarket (plain mean of 24 hours) and yearly mean, minimum and maximum |

Prices are in the unit CCEE publishes, read as R$/MWh; the dataset page does not state the unit.
