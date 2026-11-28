-- OxCGRT stringency (0 to 100) for Brazil's 27 federative units, one row per state and day,
-- 2020 and 2021, from the extract pipelines/power-lockdown/fetch.mjs saved.
select
    replace(RegionCode, 'BR_', '') as state,
    strptime(cast(Date as varchar), '%Y%m%d')::date as date_day,
    cast(StringencyIndex_Average as double) as stringency
from read_csv('{{ var("power_data") }}/raw/oxcgrt/brazil-states-2020-2021.csv', header = true, all_varchar = true)
