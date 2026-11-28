-- The lab's calendar (pipelines/power-lockdown/calendar.mjs): weekday, ISO week, holidays, bridge,
-- Carnival and Easter days, and the two weekday-aligned reference days, 364 and 728 days earlier.
-- comparable is true when none of the three days is a holiday-type day.
select
    cast(date as date) as date_day,
    cast(weekday as integer) as weekday,
    week as iso_week,
    nullif(holiday, '') as holiday,
    cast(ref_a as date) as reference_day_a,
    cast(ref_b as date) as reference_day_b,
    comparable = 1 as comparable
from read_csv('{{ var("power_data") }}/calendar.csv', header = true, all_varchar = false)
