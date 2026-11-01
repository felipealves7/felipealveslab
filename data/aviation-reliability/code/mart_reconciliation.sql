with r as (
select source_period,sum(scheduled) as n,sum(on_time) as o,sum(cancelled) as c,sum(observed_arrivals) as a,
sum(arrival_delay_sum) as d from {{ ref('mart_route_month') }} group by 1)
select r.* from r full join {{ ref('mart_month') }} m using(source_period)
where r.n is distinct from m.scheduled or r.o is distinct from m.on_time
or r.c is distinct from m.cancelled or r.a is distinct from m.observed_arrivals
or abs(r.d-m.arrival_delay_sum)>0.000001
