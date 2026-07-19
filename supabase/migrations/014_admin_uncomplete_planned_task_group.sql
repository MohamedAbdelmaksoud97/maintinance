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
    'deleted_execution_reports', deleted_reports_count
  );
end;
$$;

grant execute on function public.admin_uncomplete_planned_task_group(uuid[]) to authenticated;

notify pgrst, 'reload schema';
