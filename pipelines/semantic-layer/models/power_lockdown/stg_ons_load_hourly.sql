-- ONS hourly load (Curva de Carga Horária), 2018 to 2021, one row per subsystem and hour, read
-- unchanged from the files pipelines/power-lockdown/fetch.mjs saved. The value is MWmed, the mean
-- power over the hour, so it is also the hour's energy in MWh. The hour skipped when clocks went
-- forward on 4 November 2018 holds no load (empty, or zero in the South) and is left out.
select
    trim(id_subsistema) as subsystem_id,
    cast(din_instante as timestamp) as hour_start,
    cast(cast(din_instante as timestamp) as date) as date_day,
    cast(val_cargaenergiahomwmed as double) as load_mwh
from read_csv(
    '{{ var("power_data") }}/raw/ons/CURVA_CARGA_20*.csv',
    delim = ';', header = true, all_varchar = true
)
where val_cargaenergiahomwmed <> ''
  and not (din_instante = '2018-11-04 00:00:00')
