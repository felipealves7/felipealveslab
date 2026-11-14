# CCEE hourly PLD (PLD_HORARIO), 2021 to 14 November 2026

Hourly spot price (PLD) for Brazil's four electricity submarkets, as published by CCEE. Real public data, not synthetic. Raw files, unchanged from the download.

- **Source:** CCEE open data portal, dataset PLD_HORARIO, https://dadosabertos.ccee.org.br/dataset/pld_horario. Publisher on the page: Gerência Executiva de Preços, Modelo e Estudos Energéticos (GEPME), CCEE.
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0), as named on the dataset page, which links to https://creativecommons.org/licenses/by/4.0/. The page's notice says the data is provided as is, for information, and that availability may be interrupted. Attribution: Câmara de Comercialização de Energia Elétrica (CCEE).
- **Update cadence:** the page says monthly ("Mensal"), but the 2026 file already runs to 14 November 2026, hour 23: the PLD is set each day for every hour of the next day. The dataset page showed "last updated 13 November 2026, 19:57 BRT" when read on 14 November 2026.
- **Retrieved:** 14 November 2026, by Felipe, in a web browser. CCEE refuses automated requests from cloud servers with an "Acesso bloqueado" page (HTTP 403, "does not meet CCEE's security policies"). That was tested on 14 November 2026 from Claude's cloud environment and from the sandbox on Felipe's computer; the download hosts `pda-download.ccee.org.br` answer the same way. Until CCEE allows automated access, a refresh is a manual download into this folder.
- **Synthetic:** no.

## Files

| File | Rows | Months | Bytes | SHA-256 |
| --- | ---: | --- | ---: | --- |
| `pld_horario_2021.csv` | 35,040 | 2021-01 to 2021-12 | 1,305,856 | `e7c2c4a16d4cde691553b31200116feea77d173690d559df48c711331a9e4625` |
| `pld_horario_2022.csv` | 35,040 | 2022-01 to 2022-12 | 1,253,890 | `ecc77391aa5e0310c82eae3698369b48e132bdc4fd3c767ce31776f3b185a8df` |
| `pld_horario_2023.csv` | 35,040 | 2023-01 to 2023-12 | 1,283,110 | `ab74d01e232202acfd477bf08cc69c46cc372cfedfa73fdf352fedfacecd676b` |
| `pld_horario_2024.csv` | 35,136 | 2024-01 to 2024-12 (leap year) | 1,294,218 | `fb53ba53068cf388ae8bfea0a64da16f56d2bb56f8012fcafe05a6dcab05c3e4` |
| `pld_horario_2025.csv` | 35,040 | 2025-01 to 2025-12 | 1,022,899 | `a329d0dcedf6c2f55c9e29b616cf5e008541ccea9db318781dc6d731672cfa6e` |
| `pld_horario_2026.csv` | 30,528 | 2026-01 to 2026-11-14 | 898,237 | `d8dfde004daa4c238c6a65eb3653b1e889096de87e6981d80283b28da6f8b537` |

Rows are one hour for one submarket: four submarkets times the hours in the period.

## Columns

Semicolon-separated, header in the first row. The dataset page does not define the columns; the meanings below are read from the values.

| Column | What it holds |
| --- | --- |
| `MES_REFERENCIA` | Reference month, `YYYYMM` |
| `SUBMERCADO` | Submarket: `NORDESTE`, `NORTE`, `SUDESTE` or `SUL` |
| `PERIODO_COMERCIALIZACAO` | Hour number within the month, from 1 |
| `DIA` | Day of the month |
| `HORA` | Hour of the day, 0 to 23 |
| `PLD_HORA` | Hourly PLD. The page does not state the unit; CCEE quotes the PLD in R$/MWh, not verified from this page |

## Format differences between files

The files are kept exactly as downloaded, so a loader has to handle both shapes:

- 2021 to 2024: every text field in double quotes, Windows line endings (CRLF), oldest hour first.
- 2025 and 2026: no quotes, Unix line endings (LF). The 2026 file lists the newest hour first.
