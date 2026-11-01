select flight_id from {{ ref('fct_flights') }}
where scheduled<>cancelled+diverted+on_time+delayed+unclassified
or observed_arrivals<>on_time+delayed or positive_delay_sum<0
