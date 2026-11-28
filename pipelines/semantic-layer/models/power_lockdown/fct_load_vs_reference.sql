-- Each day of 2020 and 2021 by subsystem, with the mean load of its two weekday-aligned reference
-- days in 2018 and 2019 (or 2019 and 2020 for 2021). Summing both columns over any set of days and
-- dividing gives the change at that level of detail: a week, a month, a quarter or one subsystem.
-- Days that are not comparable carry no reference load, so they drop out of the comparison.
with cal as (
    select * from {{ ref('dim_power_calendar') }}
),
load as (
    select * from {{ ref('fct_load_daily') }}
)
select
    l.load_day_id as comparison_day_id,
    l.subsystem_id,
    l.date_day,
    c.iso_week,
    c.comparable,
    case when c.comparable and a.load_mwh is not null and b.load_mwh is not null then l.load_mwh end as compared_load_mwh,
    case when c.comparable and a.load_mwh is not null and b.load_mwh is not null then (a.load_mwh + b.load_mwh) / 2 end as reference_load_mwh
from load as l
join cal as c on c.date_day = l.date_day
left join load as a on a.subsystem_id = l.subsystem_id and a.date_day = c.reference_day_a
left join load as b on b.subsystem_id = l.subsystem_id and b.date_day = c.reference_day_b
where year(l.date_day) >= 2020
