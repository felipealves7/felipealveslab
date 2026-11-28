-- Fails if any subsystem lacks a stringency value on any day of 2020 and 2021.
select d.date_day, s.subsystem_id
from (select distinct date_day from {{ ref('stg_oxcgrt_stringency') }}) as d
cross join {{ ref('dim_subsystem') }} as s
left join {{ ref('fct_stringency_subsystem_daily') }} as f
  on f.date_day = d.date_day and f.subsystem_id = s.subsystem_id
where f.subsystem_id is null
