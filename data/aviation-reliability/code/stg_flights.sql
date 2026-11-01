select source_period||':'||cast(source_row as varchar) as flight_id,
 md5(concat_ws('|',cast(FlightDate as varchar),cast(DOT_ID_Reporting_Airline as integer),
 cast(Flight_Number_Reporting_Airline as integer),cast(OriginAirportID as integer),
 cast(DestAirportID as integer),cast(CRSDepTime as integer))) as natural_key,
 source_period,source_sha256,cast(source_row as bigint) as source_row,
 cast(FlightDate as date) as flight_date,cast(Year as integer) as year,cast(Month as integer) as month,
 cast(DayOfWeek as integer) as day_of_week,Reporting_Airline as carrier,
 cast(DOT_ID_Reporting_Airline as integer) as carrier_id,
 cast(Flight_Number_Reporting_Airline as integer) as flight_number,
 cast(OriginAirportID as integer) as origin_id,Origin as origin,OriginCityName as origin_city,
 cast(DestAirportID as integer) as destination_id,Dest as destination,DestCityName as destination_city,
 cast(CRSDepTime as integer) as scheduled_departure_hhmm,
 case when CRSDepTime<600 or CRSDepTime=2400 then '00-05' when CRSDepTime<1200 then '06-11'
      when CRSDepTime<1800 then '12-17' else '18-23' end as departure_band,
 cast(Cancelled as integer) as cancelled,cast(Diverted as integer) as diverted,
 cast(ArrDelay as double) as arrival_delay_minutes,cast(ArrDel15 as integer) as source_delayed_flag,
 cast(Distance as double) as distance_miles
from {{ ref('raw_flights') }}
