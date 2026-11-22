# data/sinalvo/

The figures behind the sinalvo case study (`/case-studies/sinalvo`): a B2B data product on Brazil's
public procurement data, tested and stopped in November 2026. `figures.json` holds every number the
page and its charts show. `src/lib/case-studies/sinalvo.mjs` draws the charts from it when the site is
built, and `scripts/sinalvo-page.test.mjs` checks that the page and the home card quote it correctly.

- **What it is:** aggregate results recorded by the project's own probes and analyses, 3–10 November
  2026. Not synthetic. No personal data and no employer data. Payment results are kept at the level of
  a Treasury grade; no municipality is named.
- **Recorded:** 22 November 2026, from the project's working reports. The probe scripts, raw API pages
  and tender files are kept outside this repository, so the figures cannot be recomputed from here.

## Sources

| Block | Underlying public source | Window | Page opened on 22 Nov 2026 |
| --- | --- | --- | --- |
| `pncp90` | PNCP consultation API, every procurement method | Notices published 5 Aug–2 Nov 2026 | [PNCP: questions and answers](https://www.gov.br/pncp/pt-br/pncp/perguntas-e-respostas) |
| `probe` | PNCP consultation API, file lists, items and tender files | Notices published 1–7 Nov 2026 (Brasilia dates), run on 8 Nov 2026 | Same |
| `labels` | 60 rows from the probe, labelled by hand and reviewed by a second AI system | 10 Nov 2026 | Not applicable |
| `paymentRisk.capag` | Tesouro Nacional, CAPAG grades for municipalities | June and September 2026 positions | [CAPAG metadata](https://www.tesourotransparente.gov.br/ckan/dataset/9ff93162-409e-48b5-91d9-cf645a47fdfc/resource/f3d005e7-97fb-4c9c-aefd-0d0288d54dfb/download/Metadados.pdf) |
| `paymentRisk.siconfi` | Siconfi, bimonthly fiscal report (RREO, annex 7) | 4th bimester of 2026 (Jul–Aug) | [Siconfi open data API](https://www.tesourotransparente.gov.br/consultas/consultas-siconfi/siconfi-api-de-dados-abertos) |
| `paymentRisk.tceSp` | TCE-SP municipal spending API, 35 São Paulo towns | Liquidations Jun–Jul 2026, payments to 31 Aug 2026 | Not verified |
| `competition` | ContrataX listing on Capterra | Checked 22 Nov 2026 | [Capterra](https://www.capterra.com/p/10050610/Contratax-Licitacoes-Publicas/) |
| `nextIdea` | Atlassian Marketplace public pages and sitemap | Read on 10 Nov 2026 | Not verified |

Licence of the underlying records: not verified for republication. This folder holds only aggregate
figures derived from them.

## Fields and units

- Counts are notices, tenders, towns, rows or API calls, as named. Money is Brazilian reais (BRL),
  except `runningCostEstimateUsdPerMonth` (US dollars, an estimate from the project's cost model).
- Shares are fractions from 0 to 1. `paidWithin30Days` is the mean, across the towns in a grade, of the
  share of company invoices paid within 30 days of the town confirming delivery (liquidação).
  `paidByAugust` is the median share of 2025 bills carried into 2026 that was paid by August, among the
  buyers that file the full report.
- Sector counts in `pncp90.sectors` are estimates from a weighted sample of 9,131 notices (about ±2% for
  the large sectors and ±11% for energy, one standard error). Totals per procurement method are exact.
- `labels.monthlyDirectEstimate` and `labels.monthlyWithAdjacentEstimate` are rough estimates: the
  sample's proportions applied to the projected 455 energy tenders a month.
- An "open tender" is a pregão or concorrência. Direct purchases, sole-source awards and accreditation
  calls appear on PNCP for transparency and are not open to bids.
