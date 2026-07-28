alter table inventory_transactions
  add column if not exists source_key text;

create unique index if not exists inventory_transactions_source_key_uidx
on inventory_transactions(source_key);

create index if not exists report_materials_task_lookup_idx
on report_materials(execution_report_id, material_id);

create or replace function app_private.enqueue_material_stock_alert(target_material_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  alert_row record;
begin
  select *
  into alert_row
  from material_stock_alerts
  where material_id = target_material_id
    and stock_status in ('LOW', 'REORDER')
  limit 1;

  if not found then
    return;
  end if;

  insert into admin_notifications (notification_type, payload)
  select
    'material_low_stock',
    jsonb_build_object(
      'message_ar', 'مادة في المخزون تحتاج متابعة',
      'material_id', alert_row.material_id,
      'material_kind', alert_row.material_kind,
      'material_name', alert_row.name,
      'material_code', alert_row.code,
      'unit', alert_row.unit,
      'stock_quantity', alert_row.stock_quantity,
      'minimum_stock', alert_row.minimum_stock,
      'reorder_level', alert_row.reorder_level,
      'stock_status', alert_row.stock_status
    )
  where not exists (
    select 1
    from admin_notifications an
    where an.notification_type = 'material_low_stock'
      and an.status = 'pending'
      and an.payload->>'material_id' = target_material_id::text
      and an.payload->>'stock_status' = alert_row.stock_status
  );
end;
$$;

revoke all on function app_private.enqueue_material_stock_alert(uuid) from public, anon, authenticated;

drop function if exists public.complete_planned_task_group(uuid[], timestamptz, timestamptz, text, text[], jsonb);

create or replace function public.complete_planned_task_group(
  target_task_ids uuid[],
  started_at_value timestamptz,
  completed_at_value timestamptz,
  notes_value text default null,
  photo_paths_value text[] default '{}'::text[],
  task_details_value jsonb default '{}'::jsonb,
  material_usage_value jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_worker uuid;
  current_worker_name text;
  completed_status_id uuid;
  assigned_status_id uuid;
  completed_day date;
  task_count integer := 0;
  report_count integer := 0;
  notification_count integer := 0;
  material_count integer := 0;
  point_row record;
  material_row record;
begin
  current_worker := app_private.current_worker_id();
  if current_worker is null then
    raise exception 'No approved worker is linked to this account';
  end if;

  select full_name into current_worker_name from public.workers where id = current_worker;

  if target_task_ids is null or cardinality(target_task_ids) = 0 then
    raise exception 'No tasks were selected';
  end if;

  if exists (
    select 1
    from unnest(target_task_ids) as requested(id)
    where not exists (
      select 1
      from planned_tasks pt
      join task_statuses ts on ts.id = pt.status_id
      where pt.id = requested.id
        and pt.main_worker_id = current_worker
        and pt.completed_at is null
        and ts.is_terminal = false
    )
  ) then
    raise exception 'One or more tasks are not available for this worker';
  end if;

  if exists (
    select 1
    from planned_tasks pt
    join maintenance_work_types wt on wt.id = pt.work_type_id
    where pt.id = any(target_task_ids)
      and pt.material_id is not null
      and wt.code in ('greasing', 'oil_change', 'grease_change')
      and coalesce(
        pt.planned_quantity,
        case
          when coalesce(material_usage_value->>pt.id::text, '') ~ '^[0-9]+(\.[0-9]+)?$'
            then (material_usage_value->>pt.id::text)::numeric
          else null
        end
      ) is null
  ) then
    raise exception 'Material usage quantity is required for oil and grease tasks without planned quantity';
  end if;

  if exists (
    select 1
    from planned_tasks pt
    join maintenance_work_types wt on wt.id = pt.work_type_id
    where pt.id = any(target_task_ids)
      and pt.material_id is not null
      and wt.code in ('greasing', 'oil_change', 'grease_change')
      and coalesce(
        pt.planned_quantity,
        case
          when coalesce(material_usage_value->>pt.id::text, '') ~ '^[0-9]+(\.[0-9]+)?$'
            then (material_usage_value->>pt.id::text)::numeric
          else null
        end
      ) <= 0
  ) then
    raise exception 'Material usage quantity must be greater than zero';
  end if;

  select id into completed_status_id from task_statuses where code = 'COMPLETED' limit 1;
  select id into assigned_status_id from assignment_statuses where code = 'ASSIGNED' limit 1;
  completed_day := coalesce(completed_at_value, now())::date;

  with inserted_reports as (
    insert into execution_reports (
      task_id,
      worker_id,
      started_at,
      completed_at,
      notes,
      photo_paths
    )
    select
      pt.id,
      current_worker,
      started_at_value,
      coalesce(completed_at_value, now()),
      concat_ws(
        E'\n\n',
        notes_value,
        case
          when nullif(trim(coalesce(task_details_value ->> pt.id::text, '')), '') is not null
            then 'تفاصيل البند: ' || nullif(trim(coalesce(task_details_value ->> pt.id::text, '')), '')
          else null
        end
      ),
      coalesce(photo_paths_value, '{}'::text[])
    from planned_tasks pt
    where pt.id = any(target_task_ids)
      and not exists (select 1 from execution_reports er where er.task_id = pt.id)
    returning id, task_id
  ),
  inserted_notifications as (
    insert into admin_notifications (
      notification_type,
      task_id,
      payload
    )
    select
      'worker_completion',
      ir.task_id,
      jsonb_build_object(
        'message_ar', 'سجل عامل تنفيذ مهمة صيانة',
        'task_id', ir.task_id,
        'worker_id', current_worker,
        'worker_name', current_worker_name,
        'notes', notes_value,
        'task_details', task_details_value ->> ir.task_id::text,
        'photo_count', coalesce(cardinality(photo_paths_value), 0),
        'completed_at', coalesce(completed_at_value, now())
      )
    from inserted_reports ir
    returning id
  ),
  material_usage as (
    select
      ir.id as execution_report_id,
      ir.task_id,
      pt.material_id,
      coalesce(
        pt.planned_quantity,
        case
          when coalesce(material_usage_value->>pt.id::text, '') ~ '^[0-9]+(\.[0-9]+)?$'
            then (material_usage_value->>pt.id::text)::numeric
          else null
        end
      ) as quantity,
      coalesce(pt.planned_quantity_unit, m.unit) as unit,
      pt.planned_quantity is null as worker_entered_quantity
    from inserted_reports ir
    join planned_tasks pt on pt.id = ir.task_id
    join maintenance_work_types wt on wt.id = pt.work_type_id
    join materials m on m.id = pt.material_id
    where pt.material_id is not null
      and wt.code in ('greasing', 'oil_change', 'grease_change')
  ),
  inserted_transactions as (
    insert into inventory_transactions (
      material_id,
      transaction_type,
      quantity,
      unit,
      transaction_date,
      source_type,
      source_id,
      source_key,
      notes,
      created_by
    )
    select
      mu.material_id,
      'planned_consumption',
      mu.quantity,
      mu.unit,
      coalesce(completed_at_value, now()),
      'execution_report',
      mu.execution_report_id,
      'planned:' || mu.task_id::text,
      case when mu.worker_entered_quantity then 'Worker entered usage quantity' else 'Planned task quantity' end,
      auth.uid()
    from material_usage mu
    where mu.quantity is not null
    on conflict (source_key) do nothing
    returning id, material_id, source_id, quantity, unit
  ),
  inserted_materials as (
    insert into report_materials (
      execution_report_id,
      material_id,
      quantity,
      unit,
      inventory_transaction_id
    )
    select
      it.source_id,
      it.material_id,
      it.quantity,
      it.unit,
      it.id
    from inserted_transactions it
    on conflict do nothing
    returning id
  )
  select
    (select count(*) from inserted_notifications),
    (select count(*) from inserted_materials)
  into notification_count, material_count;

  select count(*) into report_count from execution_reports where task_id = any(target_task_ids);

  update planned_tasks
  set status_id = completed_status_id,
      assignment_status_id = coalesce(assignment_status_id, assigned_status_id),
      started_at = started_at_value,
      completed_at = coalesce(completed_at_value, now()),
      updated_at = now()
  where id = any(target_task_ids)
    and main_worker_id = current_worker;

  get diagnostics task_count = row_count;

  for material_row in
    select distinct material_id
    from inventory_transactions
    where source_key in (
      select 'planned:' || task_id::text
      from unnest(target_task_ids) as task_ids(task_id)
    )
  loop
    perform app_private.enqueue_material_stock_alert(material_row.material_id);
  end loop;

  for point_row in
    select distinct
      pt.maintenance_point_id,
      pt.id as keep_task_id,
      wt.code as work_type_code,
      coalesce(mp.original_values, '{}'::jsonb) as original_values
    from planned_tasks pt
    join maintenance_points mp on mp.id = pt.maintenance_point_id
    left join maintenance_work_types wt on wt.id = pt.work_type_id
    where pt.id = any(target_task_ids)
      and pt.maintenance_point_id is not null
  loop
    update maintenance_points
    set schedule_anchor_date = completed_day,
        anchor_reason = 'worker_execution',
        last_inspection_date = case when point_row.work_type_code = 'inspection' then completed_day else last_inspection_date end,
        last_grease_date = case when point_row.work_type_code = 'greasing' then completed_day else last_grease_date end,
        last_change_date = case when point_row.work_type_code in ('oil_change', 'grease_change') then completed_day else last_change_date end,
        data_quality_status = 'COMPLETE',
        needs_data_review = false,
        generation_horizon_until = null,
        original_values = point_row.original_values || jsonb_build_object(
          'last_date', completed_day,
          'schedule_anchor_date', completed_day,
          'anchor_reason', 'worker_execution'
        ),
        updated_at = now()
    where id = point_row.maintenance_point_id;

    perform prepare_maintenance_point_reschedule(
      point_row.maintenance_point_id,
      completed_day,
      point_row.keep_task_id,
      'worker_execution'
    );

    perform extend_dynamic_maintenance_plan(completed_day, 12, point_row.maintenance_point_id);
  end loop;

  update planned_tasks pt
  set main_worker_id = waa.worker_id,
      assignment_status_id = assigned_status_id,
      updated_at = now()
  from maintenance_points mp
  join equipment e on e.id = mp.equipment_id
  join worker_area_assignments waa on waa.area_id = e.area_id,
  task_statuses ts
  where pt.maintenance_point_id = mp.id
    and ts.id = pt.status_id
    and pt.scheduled_date >= completed_day
    and pt.completed_at is null
    and ts.is_terminal = false
    and not exists (select 1 from execution_reports er where er.task_id = pt.id)
    and not exists (select 1 from non_execution_reports ner where ner.task_id = pt.id);

  return jsonb_build_object(
    'completed_tasks', task_count,
    'execution_reports', report_count,
    'report_materials', material_count,
    'admin_notifications', notification_count,
    'completed_day', completed_day
  );
end;
$$;

revoke execute on function public.complete_planned_task_group(uuid[], timestamptz, timestamptz, text, text[], jsonb, jsonb) from public, anon;
grant execute on function public.complete_planned_task_group(uuid[], timestamptz, timestamptz, text, text[], jsonb, jsonb) to authenticated;

create or replace function public.admin_complete_planned_task_group(
  target_task_ids uuid[],
  completed_at_value timestamptz,
  notes_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  completed_status_id uuid;
  assigned_status_id uuid;
  completed_day date;
  task_count integer := 0;
  report_count integer := 0;
  material_count integer := 0;
  point_row record;
  material_row record;
  admin_worker_id uuid;
begin
  if not app_private.is_admin() then
    raise exception 'Only admins can complete tasks from the admin plan';
  end if;

  if target_task_ids is null or cardinality(target_task_ids) = 0 then
    raise exception 'No tasks were selected';
  end if;

  insert into workers (employee_code, full_name, job_title, is_active)
  values ('ADMIN_COMPLETION', 'اعتماد المدير', 'System completion worker', true)
  on conflict (employee_code) do update set
    full_name = excluded.full_name,
    job_title = excluded.job_title,
    is_active = true,
    updated_at = now()
  returning id into admin_worker_id;

  if exists (
    select 1
    from unnest(target_task_ids) as requested(id)
    where not exists (
      select 1
      from planned_tasks pt
      join task_statuses ts on ts.id = pt.status_id
      where pt.id = requested.id
        and pt.completed_at is null
        and ts.is_terminal = false
    )
  ) then
    raise exception 'One or more tasks are not available for admin completion';
  end if;

  select id into completed_status_id from task_statuses where code = 'COMPLETED' limit 1;
  select id into assigned_status_id from assignment_statuses where code = 'ASSIGNED' limit 1;
  completed_day := coalesce(completed_at_value, now())::date;

  with inserted_reports as (
    insert into execution_reports (
      task_id,
      worker_id,
      started_at,
      completed_at,
      notes,
      photo_paths,
      approval_status,
      approved_by,
      approved_at
    )
    select
      pt.id,
      coalesce(pt.main_worker_id, admin_worker_id),
      null,
      coalesce(completed_at_value, now()),
      coalesce(notes_value, 'تم اعتبار المهمة مكتملة بواسطة المدير'),
      '{}'::text[],
      'approved',
      auth.uid(),
      now()
    from planned_tasks pt
    where pt.id = any(target_task_ids)
      and not exists (select 1 from execution_reports er where er.task_id = pt.id)
    returning id, task_id
  ),
  material_usage as (
    select
      ir.id as execution_report_id,
      ir.task_id,
      pt.material_id,
      pt.planned_quantity as quantity,
      coalesce(pt.planned_quantity_unit, m.unit) as unit
    from inserted_reports ir
    join planned_tasks pt on pt.id = ir.task_id
    join maintenance_work_types wt on wt.id = pt.work_type_id
    join materials m on m.id = pt.material_id
    where pt.material_id is not null
      and pt.planned_quantity is not null
      and pt.planned_quantity > 0
      and wt.code in ('greasing', 'oil_change', 'grease_change')
  ),
  inserted_transactions as (
    insert into inventory_transactions (
      material_id,
      transaction_type,
      quantity,
      unit,
      transaction_date,
      source_type,
      source_id,
      source_key,
      notes,
      created_by
    )
    select
      mu.material_id,
      'planned_consumption',
      mu.quantity,
      mu.unit,
      coalesce(completed_at_value, now()),
      'execution_report',
      mu.execution_report_id,
      'planned:' || mu.task_id::text,
      'Admin completion using planned task quantity',
      auth.uid()
    from material_usage mu
    on conflict (source_key) do nothing
    returning id, material_id, source_id, quantity, unit
  ),
  inserted_materials as (
    insert into report_materials (
      execution_report_id,
      material_id,
      quantity,
      unit,
      inventory_transaction_id
    )
    select
      it.source_id,
      it.material_id,
      it.quantity,
      it.unit,
      it.id
    from inserted_transactions it
    on conflict do nothing
    returning id
  )
  select
    (select count(*) from inserted_reports),
    (select count(*) from inserted_materials)
  into report_count, material_count;

  update planned_tasks
  set status_id = completed_status_id,
      assignment_status_id = coalesce(assignment_status_id, assigned_status_id),
      completed_at = coalesce(completed_at_value, now()),
      original_values = coalesce(original_values, '{}'::jsonb) || jsonb_build_object(
        'completed_by_admin', true,
        'admin_completed_at', coalesce(completed_at_value, now()),
        'admin_completed_by', auth.uid()
      ),
      updated_at = now()
  where id = any(target_task_ids);

  get diagnostics task_count = row_count;

  for material_row in
    select distinct material_id
    from inventory_transactions
    where source_key in (
      select 'planned:' || task_id::text
      from unnest(target_task_ids) as task_ids(task_id)
    )
  loop
    perform app_private.enqueue_material_stock_alert(material_row.material_id);
  end loop;

  update non_execution_reports
  set approval_status = 'approved',
      updated_at = now()
  where task_id = any(target_task_ids)
    and approval_status = 'pending';

  update admin_notifications
  set status = 'resolved',
      read_at = coalesce(read_at, now())
  where task_id = any(target_task_ids)
    and status = 'pending';

  for point_row in
    select distinct
      pt.maintenance_point_id,
      pt.id as keep_task_id,
      wt.code as work_type_code,
      coalesce(mp.original_values, '{}'::jsonb) as original_values
    from planned_tasks pt
    join maintenance_points mp on mp.id = pt.maintenance_point_id
    left join maintenance_work_types wt on wt.id = pt.work_type_id
    where pt.id = any(target_task_ids)
      and pt.maintenance_point_id is not null
  loop
    update maintenance_points
    set schedule_anchor_date = completed_day,
        anchor_reason = 'admin_execution',
        last_inspection_date = case when point_row.work_type_code = 'inspection' then completed_day else last_inspection_date end,
        last_grease_date = case when point_row.work_type_code = 'greasing' then completed_day else last_grease_date end,
        last_change_date = case when point_row.work_type_code in ('oil_change', 'grease_change') then completed_day else last_change_date end,
        data_quality_status = 'COMPLETE',
        needs_data_review = false,
        generation_horizon_until = null,
        original_values = point_row.original_values || jsonb_build_object(
          'last_date', completed_day,
          'schedule_anchor_date', completed_day,
          'anchor_reason', 'admin_execution'
        ),
        updated_at = now()
    where id = point_row.maintenance_point_id;

    perform prepare_maintenance_point_reschedule(
      point_row.maintenance_point_id,
      completed_day,
      point_row.keep_task_id,
      'admin_execution'
    );

    perform extend_dynamic_maintenance_plan(completed_day, 12, point_row.maintenance_point_id);
  end loop;

  update planned_tasks pt
  set main_worker_id = waa.worker_id,
      assignment_status_id = assigned_status_id,
      updated_at = now()
  from maintenance_points mp
  join equipment e on e.id = mp.equipment_id
  join worker_area_assignments waa on waa.area_id = e.area_id,
  task_statuses ts
  where pt.maintenance_point_id = mp.id
    and ts.id = pt.status_id
    and pt.scheduled_date >= completed_day
    and pt.completed_at is null
    and ts.is_terminal = false
    and not exists (select 1 from execution_reports er where er.task_id = pt.id)
    and not exists (select 1 from non_execution_reports ner where ner.task_id = pt.id);

  return jsonb_build_object(
    'completed_tasks', task_count,
    'execution_reports', report_count,
    'report_materials', material_count,
    'completed_day', completed_day
  );
end;
$$;

grant execute on function public.admin_complete_planned_task_group(uuid[], timestamptz, text) to authenticated;

create or replace function public.admin_uncomplete_planned_task_group(
  target_task_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  needs_assignment_status_id uuid;
  assigned_status_id uuid;
  restored_count integer := 0;
  deleted_reports_count integer := 0;
  deleted_transactions_count integer := 0;
  point_row record;
  restored_anchor date;
begin
  if not app_private.is_admin() then
    raise exception 'Only admins can reopen admin-completed tasks';
  end if;

  if target_task_ids is null or cardinality(target_task_ids) = 0 then
    raise exception 'No tasks were selected';
  end if;

  if exists (
    select 1
    from unnest(target_task_ids) as requested(id)
    where not exists (
      select 1
      from planned_tasks pt
      where pt.id = requested.id
        and pt.completed_at is not null
        and coalesce((pt.original_values->>'completed_by_admin')::boolean, false) = true
    )
  ) then
    raise exception 'Only tasks completed by admin can be reopened from this toggle';
  end if;

  select id into needs_assignment_status_id from task_statuses where code = 'NEEDS_ASSIGNMENT' limit 1;
  select id into assigned_status_id from assignment_statuses where code = 'ASSIGNED' limit 1;

  update report_materials rm
  set inventory_transaction_id = null
  from inventory_transactions it
  where rm.inventory_transaction_id = it.id
    and it.source_key in (
      select 'planned:' || task_id::text
      from unnest(target_task_ids) as task_ids(task_id)
    );

  delete from inventory_transactions it
  where it.source_key in (
    select 'planned:' || task_id::text
    from unnest(target_task_ids) as task_ids(task_id)
  );

  get diagnostics deleted_transactions_count = row_count;

  delete from execution_reports er
  using planned_tasks pt
  where er.task_id = pt.id
    and pt.id = any(target_task_ids)
    and coalesce((pt.original_values->>'completed_by_admin')::boolean, false) = true;

  get diagnostics deleted_reports_count = row_count;

  update planned_tasks
  set status_id = needs_assignment_status_id,
      assignment_status_id = case when main_worker_id is not null then assigned_status_id else assignment_status_id end,
      started_at = null,
      completed_at = null,
      original_values = coalesce(original_values, '{}'::jsonb)
        - 'completed_by_admin'
        - 'admin_completed_at'
        - 'admin_completed_by',
      updated_at = now()
  where id = any(target_task_ids);

  get diagnostics restored_count = row_count;

  for point_row in
    select distinct
      pt.maintenance_point_id,
      pt.id as keep_task_id,
      wt.code as work_type_code,
      coalesce(
        app_private.safe_json_date(pt.original_values->>'previous_scheduled_date'),
        app_private.safe_json_date(pt.original_values->>'previous_raw_due_date'),
        pt.scheduled_date
      ) as restored_anchor_date,
      coalesce(mp.original_values, '{}'::jsonb) as point_values
    from planned_tasks pt
    join maintenance_points mp on mp.id = pt.maintenance_point_id
    left join maintenance_work_types wt on wt.id = pt.work_type_id
    where pt.id = any(target_task_ids)
      and pt.maintenance_point_id is not null
  loop
    restored_anchor := point_row.restored_anchor_date;

    update maintenance_points
    set schedule_anchor_date = restored_anchor,
        anchor_reason = 'admin_reopen',
        last_inspection_date = case when point_row.work_type_code = 'inspection' then restored_anchor else last_inspection_date end,
        last_grease_date = case when point_row.work_type_code = 'greasing' then restored_anchor else last_grease_date end,
        last_change_date = case when point_row.work_type_code in ('oil_change', 'grease_change') then restored_anchor else last_change_date end,
        generation_horizon_until = null,
        original_values = point_row.point_values || jsonb_build_object(
          'last_date', restored_anchor,
          'schedule_anchor_date', restored_anchor,
          'anchor_reason', 'admin_reopen'
        ),
        updated_at = now()
    where id = point_row.maintenance_point_id;

    perform prepare_maintenance_point_reschedule(
      point_row.maintenance_point_id,
      restored_anchor,
      point_row.keep_task_id,
      'admin_reopen'
    );

    perform extend_dynamic_maintenance_plan(restored_anchor, 12, point_row.maintenance_point_id);
  end loop;

  return jsonb_build_object(
    'restored_tasks', restored_count,
    'deleted_execution_reports', deleted_reports_count,
    'deleted_inventory_transactions', deleted_transactions_count
  );
end;
$$;

grant execute on function public.admin_uncomplete_planned_task_group(uuid[]) to authenticated;

notify pgrst, 'reload schema';
