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
  point_row record;
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
    and not exists (select 1 from execution_reports er where er.task_id = pt.id);

  get diagnostics report_count = row_count;

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
    'completed_day', completed_day
  );
end;
$$;

grant execute on function public.admin_complete_planned_task_group(uuid[], timestamptz, text) to authenticated;

notify pgrst, 'reload schema';
