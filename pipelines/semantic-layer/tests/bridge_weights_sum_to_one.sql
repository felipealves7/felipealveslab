-- Fails with every subsystem and day on which the bridge weights of the states with a value do not
-- sum to one, under either weighting.
select subsystem_id, date_day, weight_used_capacity, weight_used_equal
from {{ ref('fct_stringency_subsystem_daily') }}
where abs(weight_used_capacity - 1) > 1e-5 or abs(weight_used_equal - 1) > 1e-5
