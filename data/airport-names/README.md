# Airport names: data (work in progress, build stopped; see issue 10)

- **Source:** OurAirports `airports.csv`, https://ourairports.com/data/ (opened 2026-10-29).
- **Licence:** the data page says the data is released to the Public Domain, with no assurance of correctness.
- **Retrieved:** 2026-10-29. The source says it updates nightly.
- **Synthetic:** no.
- **`airports.csv`:** 1,155 rows, `type` large_airport with `scheduled_service` yes, seven columns kept. Rebuild with `node pipelines/airport-names/build-set.mjs <path to airports.csv>`.
- **`labels.csv`:** hand labels (person, place, other) for a fixed 200-airport sample (seed 2029), written by the Builder from the airport name and city. `unsure` marks 13 labels not checked against a source. Felipe has not reviewed them.
- **`results.json`:** output of `node pipelines/airport-names/evaluate.mjs`.
