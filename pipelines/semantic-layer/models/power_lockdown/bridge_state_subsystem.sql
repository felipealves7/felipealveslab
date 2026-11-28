-- The weighted bridge from states to subsystems (pipelines/power-lockdown/bridge.mjs): each state
-- belongs to the subsystem that holds most of its substations in ONS's operating network table,
-- and weighs its share of that subsystem's basic-grid transformer capacity in service on
-- 1 March 2020 (capacity), or an equal share (equal).
select
    state,
    subsystem as subsystem_id,
    cast(mva as double) as transformer_mva,
    cast(w_capacity as double) as weight_capacity,
    cast(w_equal as double) as weight_equal
from read_csv('{{ var("power_data") }}/bridge.csv', header = true, all_varchar = true)
