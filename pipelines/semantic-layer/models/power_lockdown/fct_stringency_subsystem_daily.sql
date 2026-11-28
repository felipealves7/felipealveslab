-- Stringency by subsystem and day, weighted across the subsystem's states through the bridge.
-- A state with no value that day would drop out and the others would be scaled up;
-- weight_used records the weights that were present, and a test requires it to be one.
select
    md5(b.subsystem_id || '|' || cast(s.date_day as varchar)) as stringency_day_id,
    b.subsystem_id,
    s.date_day,
    sum(b.weight_capacity * s.stringency) / sum(b.weight_capacity) as stringency_capacity,
    sum(b.weight_equal * s.stringency) / sum(b.weight_equal) as stringency_equal,
    sum(b.weight_capacity) as weight_used_capacity,
    sum(b.weight_equal) as weight_used_equal,
    count(*) as states
from {{ ref('stg_oxcgrt_stringency') }} as s
join {{ ref('bridge_state_subsystem') }} as b on b.state = s.state
where s.stringency is not null
group by b.subsystem_id, s.date_day
