# dst-crashes

Inputs and outputs for `/lab/spring-clock-change-road-deaths`. Real public data, not synthetic.

## Sources

- **NHTSA Fatality Analysis Reporting System (FARS)**, national CSV archives for 1996 to 2024,
  `https://static.nhtsa.gov/nhtsa/downloads/FARS/<year>/National/FARS<year>NationalCSV.zip`,
  downloaded 17 Nov 2026 without a login. Only the accident table is read. The raw archives
  (about 540 MB) are not committed; `extract.json` records the SHA-256 of each one. Released yearly.
  Whether the 2023 and 2024 files are NHTSA's final or annual-report release was not verified.
  Licence: a work of the US federal government, which has no US copyright
  ([17 U.S.C. 105](https://www.law.cornell.edu/uscode/text/17/105)). The
  [Data.gov record](https://catalog.data.gov/dataset/fatality-analysis-reporting-system-fars) lists
  rights and access level as public. NHTSA's own website policies page refused automated requests
  (HTTP 403), so it was not read.
- **IANA Time Zone Database**, release 2026f, file `northamerica`, downloaded 17 Nov 2026 from
  https://data.iana.org/time-zones/tzdb/. Public domain
  ([LICENSE](https://data.iana.org/time-zones/tzdb/LICENSE)). `tzdata-us.txt` keeps, unchanged, the
  `Rule US` lines and the zones the pipeline assigns to states.
- **Sun position**: computed, no dataset.

## Files

- `window.csv`: one row per year, anchor Sunday, state and day, for days with at least one fatal
  crash, 14 days either side of the first Sunday of April and the second Sunday of March. Days with
  no crash are absent (count them as zero). Columns:
  - `year`; `anchor` (`april1` or `march2`); `is_change` (1 if the clocks changed on that anchor that year)
  - `state` (postal code); `group` (`observing` or `standard`, from the IANA rules for the state's zone)
  - `offset` (days from the anchor Sunday); `date` (YYYY-MM-DD); `weekday` (0 = Sunday)
  - `crashes` (fatal crashes); `deaths` (people killed)
  - `crashes_am` (05:00-09:59 clock time); `crashes_pm` (16:00-20:59); `crashes_time_unknown`
  - `crashes_sun_day`, `crashes_sun_twilight`, `crashes_sun_dark`: sun above -0.833°, between that
    and -6°, below -6°, at the crash's place and minute. From 2001 only; the rest have no usable
    coordinates or time.
- `extract.json`: one entry per year: source URL, SHA-256, file name in the archive, column count,
  byte-order mark, rows, dropped rows by reason, weekday mismatches, light-condition codes seen, and
  the join tallies.
- `results.json`: every estimate on the page, the design constants and the chart series.
- `tzdata-us.txt`: the IANA extract described above.

Indiana and records outside the 50 states and DC are left out of `window.csv`.

## Rebuild

```
node pipelines/dst-crashes/extract.mjs --cache <folder>
node pipelines/dst-crashes/analyse.mjs
```

The page's chart is drawn from `results.json` when the site is built (`charts/dst_days.py`, through `src/lib/charts/dst.mjs`).
