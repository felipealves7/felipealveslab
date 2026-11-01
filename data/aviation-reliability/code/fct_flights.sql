{{ config(materialized='incremental',incremental_strategy='append',pre_hook="{{ replace_partitions() }}",on_schema_change='fail') }}
with base as (
 select *,cancelled=0 and diverted=0 and arrival_delay_minutes is not null as observed
 from {{ ref('stg_flights') }}
 {% if is_incremental() %}
 where source_period in ({% for p in var('reload_periods',[]) %}'{{ p }}'{% if not loop.last %},{% endif %}{% endfor %})
 {% endif %}
)
select base.* exclude(origin,destination,origin_city,destination_city),
 base.origin as reported_origin,base.destination as reported_destination,
 a.airport as origin,a.city as origin_city,b.airport as destination,b.city as destination_city,
 1::bigint as scheduled,cast(observed as bigint) as observed_arrivals,
 cast(observed and arrival_delay_minutes<15 as bigint) as on_time,
 cast(observed and arrival_delay_minutes>=15 as bigint) as delayed,
 cast(cancelled=0 and diverted=0 and not observed as bigint) as unclassified,
 case when observed then arrival_delay_minutes else 0 end as arrival_delay_sum,
 case when observed then greatest(arrival_delay_minutes,0) else 0 end as positive_delay_sum
from base left join {{ ref('dim_airports') }} a on base.origin_id=a.airport_id
left join {{ ref('dim_airports') }} b on base.destination_id=b.airport_id
