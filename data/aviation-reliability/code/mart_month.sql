select source_period,year,month,
count(*)::bigint as scheduled,sum(cancelled)::bigint as cancelled,sum(diverted)::bigint as diverted,
sum(observed_arrivals)::bigint as observed_arrivals,sum(on_time)::bigint as on_time,
sum(delayed)::bigint as delayed,sum(unclassified)::bigint as unclassified,
sum(arrival_delay_sum)::double as arrival_delay_sum,sum(positive_delay_sum)::double as positive_delay_sum
from {{ ref('fct_flights') }}
group by 1,2,3
