-- The four ONS subsystems of the national grid.
select * from (values
    ('N', 'North'),
    ('NE', 'Northeast'),
    ('S', 'South'),
    ('SE', 'Southeast/Centre-West')
) as t(subsystem_id, subsystem_name)
