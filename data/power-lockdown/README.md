# power-lockdown

Inputs and outputs for `/lab/brazil-lockdown-power-load`. Real public data, not synthetic.
Downloaded 28 Nov 2026 by `pipelines/power-lockdown/fetch.mjs`; `sources.json` records each file's
address, size and SHA-256. ONS revises published values after its consistency checks, so a later
download with a different hash is a revision, not the same file.

## Sources

- **ONS, Curva de Carga Horária** (hourly load by subsystem), yearly files 2018 to 2021,
  https://dados.ons.org.br/dataset/curva-carga, from the public bucket
  `ons-aws-prod-opendata` with no account. Updated twice a day. Licence: Creative Commons
  Attribution, as stated on the dataset page. Columns per the data dictionary
  (`DicionarioDados_CurvaCarga.pdf`, version 1.2 of 6 Apr 2026): `id_subsistema` (N, NE, S, SE),
  `nom_subsistema`, `din_instante` (the hour), `val_cargaenergiahomwmed` (load in MWmed; not null,
  zero allowed, never negative). Kept unchanged in `raw/ons/`.
- **ONS, Subestações da Rede de Operação** (`SUBESTACAO.csv`) and **Capacidade de Transformação
  da Rede Básica** (`CAPACIDADE_TRANSFORMACAO.csv`), https://dados.ons.org.br/dataset/subestacao and
  https://dados.ons.org.br/dataset/capacidade-transformacao. Creative Commons Attribution, as stated
  in the ONS open data portal's record for each. Used for the state-to-subsystem bridge only. Kept unchanged in `raw/ons/`.
- **Oxford COVID-19 Government Response Tracker**, compact subnational file v1,
  https://github.com/OxCGRT/covid-policy-dataset. CC BY 4.0, as stated in the repository README.
  No longer updated. The 43 MB file is reduced to Brazil's 27 state rows (`STATE_TOTAL`) for 2020
  and 2021 and five columns (`raw/oxcgrt/brazil-states-2020-2021.csv`); the hash of the whole file
  is recorded. Credit: Oxford COVID-19 Government Response Tracker, Blavatnik School of
  Government, University of Oxford.
- **Banco Central do Brasil, IBC-Br**, series 24363 (not seasonally adjusted) and 24364
  (seasonally adjusted), January 2017 to December 2021, from the SGS API with no key. Licence: Open
  Data Commons Open Database License (ODbL), as listed on the BCB open data pages
  (https://dadosabertos.bcb.gov.br/dataset/24363-indice-de-atividade-economica-do-banco-central---ibc-br
  and https://dadosabertos.bcb.gov.br/dataset/24364-indice-de-atividade-economica-do-banco-central-ibc-br---com-ajuste-sazonal).
  ODbL is share-alike: `raw/bcb/` and `ibcbr.csv` are a database derived from it and carry ODbL.

## Files written by `pipelines/power-lockdown/analyse.mjs`

- `results.json`: the 41 checks, the bridge, the falls at each level of detail, IBC-Br by month and
  quarter, April 2020 by subsystem, the dose estimates and the chart rows.
- `daily_load.csv`: `date`, `subsystem`, `mwh` (the sum of 24 hourly values). Days with a missing or
  zero hour are absent.
- `bridge.csv`: `state`, `subsystem`, `substations` (in that subsystem), `substations_elsewhere`,
  `mva` (basic-grid transformer capacity in service on 1 March 2020, in that subsystem),
  `w_capacity` and `w_equal` (each sums to one within a subsystem).
- `calendar.csv`: `date`, `weekday` (0 = Sunday), `week` (ISO), `month`, `quarter`, `holiday`
  (holiday, bridge, Carnival or Easter day, or empty), `ref_a` and `ref_b` (364 and 728 days
  earlier), `comparable` (1 if none of the three days is a holiday-type day).
- `ibcbr.csv`: `month`, `ibcbr` (24363), `ibcbr_sa` (24364).

The semantic layer (`pipelines/semantic-layer/models/power_lockdown/`) reads the raw files and these
tables.
