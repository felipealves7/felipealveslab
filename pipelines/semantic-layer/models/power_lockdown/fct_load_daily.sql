-- Daily energy by subsystem: the sum of the day's hourly values. Only days with all 24 hours and
-- no zero hour are kept, the same rule as pipelines/power-lockdown/analyse.mjs.
select
    md5(subsystem_id || '|' || cast(date_day as varchar)) as load_day_id,
    subsystem_id,
    date_day,
    sum(load_mwh) as load_mwh,
    count(*) as hours
from {{ ref('stg_ons_load_hourly') }}
group by subsystem_id, date_day
having count(*) = 24 and min(load_mwh) > 0
