create or replace view material_stock as
select
  m.id as material_id,
  m.material_kind,
  m.code,
  m.name,
  m.unit,
  coalesce(sum(
    case
      when it.transaction_type in ('opening', 'purchase', 'adjustment_in') then it.quantity
      when it.transaction_type in ('adjustment_out', 'planned_consumption', 'troubleshooting_consumption') then -it.quantity
      else 0
    end
  ), 0) as stock_quantity
from materials m
left join inventory_transactions it on it.material_id = m.id
where m.is_active = true
group by m.id;

alter view material_stock set (security_invoker = true);

create or replace view material_stock_alerts as
select
  ms.material_id,
  ms.material_kind,
  ms.code,
  ms.name,
  ms.unit,
  ms.stock_quantity,
  m.minimum_stock,
  m.reorder_level,
  case
    when m.reorder_level is not null and ms.stock_quantity <= m.reorder_level then 'REORDER'
    when m.minimum_stock is not null and ms.stock_quantity <= m.minimum_stock then 'LOW'
    else 'OK'
  end as stock_status
from material_stock ms
join materials m on m.id = ms.material_id
where m.is_active = true;

alter view material_stock_alerts set (security_invoker = true);

grant select on material_stock to authenticated;
grant select on material_stock_alerts to authenticated;

notify pgrst, 'reload schema';
