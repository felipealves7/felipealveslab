-- The Lab's shared calendar: one row per day from 2020 to 2030. MetricFlow uses it as its time
-- spine, and every lab joins its dates to it, whatever grain its data comes in.
select
    cast(day as date) as date_day,
    cast(date_trunc('month', day) as date) as month_start,
    cast(date_trunc('quarter', day) as date) as quarter_start,
    cast(year(day) as integer) as calendar_year,
    cast(quarter(day) as integer) as calendar_quarter
from range(timestamp '2020-01-01', timestamp '2031-01-01', interval 1 day) as t(day)
