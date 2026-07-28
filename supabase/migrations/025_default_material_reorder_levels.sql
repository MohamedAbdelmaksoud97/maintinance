update materials m
set reorder_level = defaults.suggested_reorder_level,
    original_values = coalesce(m.original_values, '{}'::jsonb) || jsonb_build_object(
      'default_reorder_level_source', 'sap_usage_points_and_stock',
      'default_reorder_level_set_at', now()
    ),
    updated_at = now()
from (
  select
    m.id,
    case
      when coalesce(ms.stock_quantity, 0) <= 0 then 1
      when coalesce((m.original_values->>'usage_points')::numeric, 0) >= 100 then greatest(2, ceil(ms.stock_quantity * 0.50))
      when coalesce((m.original_values->>'usage_points')::numeric, 0) >= 20 then greatest(1, ceil(ms.stock_quantity * 0.30))
      else greatest(1, ceil(ms.stock_quantity * 0.20))
    end as suggested_reorder_level
  from materials m
  join material_stock ms on ms.material_id = m.id
  where m.reorder_level is null
    and m.material_kind in ('oil', 'grease')
    and (
      m.original_values->>'stock_source_date' = '2026-07-26'
      or m.original_values->>'source_mode' = 'manual_inventory_material'
    )
) defaults
where m.id = defaults.id;

notify pgrst, 'reload schema';
