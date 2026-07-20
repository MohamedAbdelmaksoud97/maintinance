drop function if exists public.complete_planned_task_group(uuid[], timestamptz, timestamptz, text, text[]);

create or replace function public.complete_planned_task_group(
  target_task_ids uuid[],
  started_at_value timestamptz,
  completed_at_value timestamptz,
  notes_value text default null,
  photo_paths_value text[] default '{}'::text[],
  task_details_value jsonb default '{}'::jsonb
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
  point_row record;
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
    returning task_id
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
  )
  select count(*) into notification_count from inserted_notifications;

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
    'admin_notifications', notification_count,
    'completed_day', completed_day
  );
end;
$$;

revoke execute on function public.complete_planned_task_group(uuid[], timestamptz, timestamptz, text, text[], jsonb) from public, anon;
grant execute on function public.complete_planned_task_group(uuid[], timestamptz, timestamptz, text, text[], jsonb) to authenticated;

create or replace function public.update_adhoc_execution_report(
  target_report_id uuid,
  started_at_value timestamptz default null,
  ended_at_value timestamptz default null,
  result_value text default null,
  photo_paths_value text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_worker uuid;
  current_worker_name text;
  updated_report record;
begin
  current_worker := app_private.current_worker_id();
  if current_worker is null then
    raise exception 'No approved worker is linked to this account';
  end if;

  if target_report_id is null then
    raise exception 'No ad-hoc task was selected';
  end if;

  if not exists (
    select 1
    from troubleshooting_assignees ta
    where ta.report_id = target_report_id
      and ta.worker_id = current_worker
  ) then
    raise exception 'This ad-hoc task is not assigned to this worker';
  end if;

  select full_name into current_worker_name from public.workers where id = current_worker;

  update troubleshooting_reports tr
  set started_at = started_at_value,
      ended_at = ended_at_value,
      result = result_value,
      status = case when ended_at_value is not null then 'completed' else 'in_progress' end,
      photo_paths = coalesce(tr.photo_paths, '{}'::text[]) || coalesce(photo_paths_value, '{}'::text[]),
      updated_at = now()
  where tr.id = target_report_id
  returning tr.id, tr.issue, tr.priority, tr.status, tr.started_at, tr.ended_at, tr.result
  into updated_report;

  insert into admin_notifications (
    notification_type,
    payload
  )
  select
    'adhoc_execution_update',
    jsonb_build_object(
      'message_ar', 'حفظ عامل تقرير تنفيذ مهمة عارضة',
      'report_id', updated_report.id,
      'worker_id', current_worker,
      'worker_name', current_worker_name,
      'issue', updated_report.issue,
      'priority', updated_report.priority,
      'status', updated_report.status,
      'result', updated_report.result,
      'started_at', updated_report.started_at,
      'ended_at', updated_report.ended_at,
      'photo_count', coalesce(cardinality(photo_paths_value), 0),
      'equipment_code', e.equipment_code,
      'equipment_name', e.name,
      'area_name', a.name
    )
  from troubleshooting_reports tr
  left join equipment e on e.id = tr.equipment_id
  left join areas a on a.id = e.area_id
  where tr.id = target_report_id;

  return jsonb_build_object(
    'report_id', updated_report.id,
    'status', updated_report.status
  );
end;
$$;

revoke execute on function public.update_adhoc_execution_report(uuid, timestamptz, timestamptz, text, text[]) from public, anon;
grant execute on function public.update_adhoc_execution_report(uuid, timestamptz, timestamptz, text, text[]) to authenticated;

create or replace function public.mark_worker_notification_read(target_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_worker uuid;
begin
  current_worker := app_private.current_worker_id();
  if current_worker is null then
    raise exception 'No approved worker is linked to this account';
  end if;

  update notification_queue
  set status = 'sent',
      sent_at = coalesce(sent_at, now())
  where id = target_notification_id
    and worker_id = current_worker
    and status = 'pending';
end;
$$;

revoke execute on function public.mark_worker_notification_read(uuid) from public, anon;
grant execute on function public.mark_worker_notification_read(uuid) to authenticated;
