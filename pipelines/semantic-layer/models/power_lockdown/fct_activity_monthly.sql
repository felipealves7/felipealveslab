-- Banco Central do Brasil's IBC-Br, monthly, national: series 24363 (not seasonally adjusted) and
-- 24364 (seasonally adjusted), 2017 to 2021.
select
    cast(month || '-01' as date) as month_start,
    cast(ibcbr as double) as ibcbr,
    cast(ibcbr_sa as double) as ibcbr_sa
from read_csv('{{ var("power_data") }}/ibcbr.csv', header = true, all_varchar = true)
