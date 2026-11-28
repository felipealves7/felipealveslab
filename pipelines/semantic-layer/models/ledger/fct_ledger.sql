-- One row per company, month and account of the synthetic Ask the Ledger data.
-- Amounts are thousands of AED and always positive; the account group says how they count.
select
    md5(entity || '|' || month || '|' || account) as ledger_line_id,
    entity as company,
    account,
    account_group,
    cast(strptime(month || '-01', '%Y-%m-%d') as date) as month_start,
    amount
from read_parquet('{{ var("ledger_parquet") }}')
