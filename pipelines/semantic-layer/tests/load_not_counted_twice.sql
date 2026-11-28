-- Fails with every full day on which the four subsystems' daily load does not add up to the sum of
-- all hourly rows that day: no hour is counted twice or lost between the hourly and daily tables.
with hourly as (
    select date_day, sum(load_mwh) as mwh from {{ ref('stg_ons_load_hourly') }} group by date_day
),
daily as (
    select date_day, sum(load_mwh) as mwh, count(*) as subsystems from {{ ref('fct_load_daily') }} group by date_day
)
select d.date_day, d.mwh as daily_mwh, h.mwh as hourly_mwh
from daily as d
join hourly as h using (date_day)
where d.subsystems = 4 and abs(d.mwh - h.mwh) > 1e-6
