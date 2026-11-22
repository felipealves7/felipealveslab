# aviation-shutdown

Daily flight totals from 1 September to 30 November 2025, built to test what the FAA's November 2025
flight cuts did. Used by the shutdown test on `/lab/aviation-reliability`. Built in this repository by
`pipelines/aviation-shutdown/` and checked by its tests on every run of `npm test`.

## Source and licence

- **Flights:** US Bureau of Transportation Statistics, Reporting Carrier On-Time Performance
  (1987-present), the September, October and November 2025 archives from https://transtats.bts.gov/PREZIP/.
  Downloaded on 22 November 2026. File names, SHA-256 and BTS's last-modified dates are in
  `extract.json`. The same table as `data/aviation-reliability/`, re-read for these three months.
- **Licence:** public US federal flight records. The Data.gov record
  https://catalog.data.gov/dataset/bts-flight-data (publisher: Bureau of Transportation Statistics) gives
  https://www.usa.gov/government-works as its licence. Opened on 22 November 2026. No Creative Commons
  licence is claimed.
- **The order:** FAA emergency order of 6 November 2025, Federal Register of 12 November 2025, with the
  40 High Impact Airports in its Appendix A:
  https://www.govinfo.gov/content/pkg/FR-2025-11-12/html/2025-19850.htm. It ordered cuts in scheduled
  domestic operations of 4% from 7 November, 6% from 11 November, 8% from 13 November and 10% from
  14 November, between 6 a.m. and 10 p.m. local time.
- **The cuts as applied:** the cut grew from 4% to 6% and went no higher
  (https://www.pbs.org/newshour/nation/faa-eases-commercial-flight-restrictions-after-shutdown-strain-but-some-limits-remain,
  14 November 2025). It was 3% on 15 and 16 November and was lifted from 6 a.m. EST on 17 November
  (https://www.cbsnews.com/amp/texas/news/faa-lifts-emergency-order-slashing-flights). All three pages
  were opened on 22 November 2026.
- **What "cancelled" means here:** BTS counts a flight as cancelled when it "was listed in a carrier's
  computer reservation system during the seven calendar days prior to scheduled departure but was not
  operated" (https://transtats.bts.gov/Glossary.asp?v0qrA=P, opened on 22 November 2026). A flight
  dropped earlier than that is not a cancellation in this table; it shows only as fewer scheduled flights.
- **Synthetic:** no. **Personal data:** none; rows are flights, totalled by day.
- **Update cadence:** none. A fixed extract; BTS can revise past months.

## Files

| File | What it is |
| --- | --- |
| `daily-exposure.csv` | One row per day and exposure group: flights with a listed airport at both ends (`both`), at one end (`one`) or at neither (`none`) |
| `daily-airport.csv` | One row per day and origin airport, with `high_impact` = 1 for the 40 listed airports; ready for a BI tool |
| `extract.json` | The three source archives with SHA-256, size, BTS's last-modified date and row count, and the airport list |
| `results.json` | What `pipelines/aviation-shutdown/analyse.mjs` computes from `daily-exposure.csv` |
| `tableau-daily.csv` | `daily-exposure.csv` with plain column names, group labels and the period, for the Tableau view; written by `analyse.mjs` |

## Columns

| Column | Meaning |
| --- | --- |
| `date` | Flight date, local, ISO format |
| `exposure` / `origin` | Exposure group, or the origin airport's IATA code |
| `high_impact` | 1 if the origin is one of the 40 listed airports |
| `cut` | Percentage cut in force that day as applied (4, 6, 3), 0 when none |
| `scheduled` | Flights in the table |
| `cancelled`, `cancelled_nas` | Cancelled flights; of those, cancelled for a National Aviation System reason (code C) |
| `diverted` | Diverted flights |
| `observed_arrivals` | Neither cancelled nor diverted, with an arrival delay |
| `on_time` | Observed arrivals less than 15 minutes late |
| `arrival_delay_sum` | Sum of signed arrival delays, minutes (early arrivals count as negative) |
| `positive_delay_sum` | Sum of arrival delays with early arrivals counted as zero, minutes |

Rates are sums divided by sums, as in `data/aviation-reliability/metric-contract.json`.

## Rebuild

```sh
NODE_USE_ENV_PROXY=1 node pipelines/aviation-shutdown/extract.mjs --cache <folder>
node pipelines/aviation-shutdown/analyse.mjs
```

The extract downloads any archive missing from the folder (about 28 MB each).
