create table if not exists worker_area_assignments (
  worker_id uuid not null references workers(id) on delete cascade,
  area_id uuid not null references areas(id) on delete cascade,
  assigned_by uuid references profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (worker_id, area_id),
  unique (area_id)
);

create table if not exists admin_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,
  task_id uuid references planned_tasks(id) on delete cascade,
  non_execution_report_id uuid references non_execution_reports(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'read', 'resolved', 'cancelled')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists worker_area_assignments_worker_idx
on worker_area_assignments(worker_id);

create index if not exists admin_notifications_status_created_idx
on admin_notifications(status, created_at desc);

create index if not exists admin_notifications_task_idx
on admin_notifications(task_id);

alter table worker_area_assignments enable row level security;
alter table admin_notifications enable row level security;

drop trigger if exists set_updated_at on worker_area_assignments;
create trigger set_updated_at
before update on worker_area_assignments
for each row execute function set_updated_at();

create or replace function public.refresh_area_worker_task_assignments(target_start date default (timezone('Asia/Riyadh', now()))::date)
returns jsonb
language plpgsql
security invoker
as $$
declare
  assigned_status_id uuid;
  unassigned_status_id uuid;
  assigned_count integer := 0;
  unassigned_count integer := 0;
begin
  if not app_private.is_admin() then
    raise exception 'Only admins can refresh task assignments';
  end if;

  select id into assigned_status_id from public.assignment_statuses where code = 'ASSIGNED' limit 1;
  select id into unassigned_status_id from public.assignment_statuses where code = 'UNASSIGNED' limit 1;

  update public.planned_tasks pt
  set main_worker_id = waa.worker_id,
      assignment_status_id = assigned_status_id,
      original_values = coalesce(pt.original_values, '{}'::jsonb) || jsonb_build_object(
        'area_worker_assignment_refreshed_at', now(),
        'area_worker_assignment_source', 'worker_area_assignments'
      ),
      updated_at = now()
  from public.equipment e
  join public.worker_area_assignments waa on waa.area_id = e.area_id,
  public.task_statuses ts
  where pt.equipment_id = e.id
    and ts.id = pt.status_id
    and pt.scheduled_date >= target_start
    and pt.completed_at is null
    and ts.is_terminal = false
    and not exists (select 1 from public.execution_reports er where er.task_id = pt.id)
    and not exists (select 1 from public.non_execution_reports ner where ner.task_id = pt.id)
    and pt.main_worker_id is distinct from waa.worker_id;

  get diagnostics assigned_count = row_count;

  update public.planned_tasks pt
  set main_worker_id = null,
      assignment_status_id = unassigned_status_id,
      original_values = coalesce(pt.original_values, '{}'::jsonb) || jsonb_build_object(
        'area_worker_assignment_refreshed_at', now(),
        'area_worker_assignment_source', 'worker_area_assignments',
        'area_worker_assignment_missing_owner', true
      ),
      updated_at = now()
  from public.equipment e
  cross join public.task_statuses ts
  where pt.equipment_id = e.id
    and ts.id = pt.status_id
    and pt.scheduled_date >= target_start
    and pt.completed_at is null
    and ts.is_terminal = false
    and pt.main_worker_id is not null
    and not exists (select 1 from public.worker_area_assignments waa where waa.area_id = e.area_id)
    and not exists (select 1 from public.execution_reports er where er.task_id = pt.id)
    and not exists (select 1 from public.non_execution_reports ner where ner.task_id = pt.id);

  get diagnostics unassigned_count = row_count;

  return jsonb_build_object(
    'target_start', target_start,
    'assigned_tasks', assigned_count,
    'unassigned_tasks', unassigned_count
  );
end;
$$;

grant execute on function public.refresh_area_worker_task_assignments(date) to authenticated;

create or replace function public.enqueue_daily_worker_notifications(target_date date default (timezone('Asia/Riyadh', now()))::date)
returns integer
language plpgsql
security invoker
as $$
declare
  inserted_count integer;
begin
  insert into notification_queue (
    worker_id,
    task_id,
    notification_type,
    scheduled_for,
    payload
  )
  select
    pt.main_worker_id,
    pt.id,
    'daily_task',
    make_timestamptz(
      extract(year from target_date)::int,
      extract(month from target_date)::int,
      extract(day from target_date)::int,
      9,
      0,
      0,
      'Asia/Riyadh'
    ),
    jsonb_build_object(
      'message_ar', 'لديك مهمة صيانة اليوم',
      'scheduled_date', pt.scheduled_date,
      'task_id', pt.id,
      'equipment_id', pt.equipment_id
    )
  from planned_tasks pt
  join task_statuses ts on ts.id = pt.status_id
  join assignment_statuses ast on ast.id = pt.assignment_status_id
  where pt.scheduled_date = target_date
    and pt.main_worker_id is not null
    and pt.completed_at is null
    and ts.is_terminal = false
    and ast.code <> 'UNASSIGNED'
    and not exists (
      select 1
      from notification_queue nq
      where nq.task_id = pt.id
        and nq.worker_id = pt.main_worker_id
        and nq.notification_type = 'daily_task'
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.enqueue_daily_worker_notifications(date) to authenticated;

create or replace function public.complete_planned_task_group(
  target_task_ids uuid[],
  started_at_value timestamptz,
  completed_at_value timestamptz,
  notes_value text default null,
  photo_paths_value text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_worker uuid;
  completed_status_id uuid;
  assigned_status_id uuid;
  completed_day date;
  task_count integer := 0;
  report_count integer := 0;
  point_row record;
begin
  current_worker := app_private.current_worker_id();
  if current_worker is null then
    raise exception 'No approved worker is linked to this account';
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
    notes_value,
    coalesce(photo_paths_value, '{}'::text[])
  from planned_tasks pt
  where pt.id = any(target_task_ids)
    and not exists (select 1 from execution_reports er where er.task_id = pt.id);

  get diagnostics report_count = row_count;

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
    'completed_day', completed_day
  );
end;
$$;

grant execute on function public.complete_planned_task_group(uuid[], timestamptz, timestamptz, text, text[]) to authenticated;

create or replace function public.submit_non_execution_group(
  target_task_ids uuid[],
  reason_value text,
  evidence_paths_value text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_worker uuid;
  missed_status_id uuid;
  report_count integer := 0;
  missed_count integer := 0;
begin
  current_worker := app_private.current_worker_id();
  if current_worker is null then
    raise exception 'No approved worker is linked to this account';
  end if;

  if target_task_ids is null or cardinality(target_task_ids) = 0 then
    raise exception 'No tasks were selected';
  end if;

  if nullif(trim(reason_value), '') is null then
    raise exception 'Non execution reason is required';
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

  select id into missed_status_id from task_statuses where code = 'MISSED' limit 1;

  with inserted_reports as (
    insert into non_execution_reports (
      task_id,
      worker_id,
      reason,
      evidence_paths
    )
    select
      pt.id,
      current_worker,
      reason_value,
      coalesce(evidence_paths_value, '{}'::text[])
    from planned_tasks pt
    where pt.id = any(target_task_ids)
      and not exists (select 1 from non_execution_reports ner where ner.task_id = pt.id)
    returning id, task_id
  ),
  inserted_notifications as (
    insert into admin_notifications (
      notification_type,
      task_id,
      non_execution_report_id,
      payload
    )
    select
      'non_execution_reason',
      ir.task_id,
      ir.id,
      jsonb_build_object(
        'message_ar', 'سجل عامل سبب عدم تنفيذ مهمة صيانة',
        'reason', reason_value,
        'task_id', ir.task_id,
        'worker_id', current_worker
      )
    from inserted_reports ir
    returning id
  )
  select count(*) into report_count from inserted_notifications;

  update planned_tasks
  set status_id = missed_status_id,
      updated_at = now()
  where id = any(target_task_ids)
    and main_worker_id = current_worker
    and completed_at is null;

  get diagnostics missed_count = row_count;

  return jsonb_build_object(
    'missed_tasks', missed_count,
    'non_execution_reports', report_count
  );
end;
$$;

grant execute on function public.submit_non_execution_group(uuid[], text, text[]) to authenticated;

drop policy if exists "worker area assignments own or admin read" on worker_area_assignments;
drop policy if exists "worker area assignments admin manage" on worker_area_assignments;
drop policy if exists "admin notifications admin read" on admin_notifications;
drop policy if exists "admin notifications admin manage" on admin_notifications;
drop policy if exists "areas assigned worker read" on areas;
drop policy if exists "production lines assigned worker read" on production_lines;
drop policy if exists "equipment assigned worker read" on equipment;
drop policy if exists "maintenance points assigned task worker read" on maintenance_points;
drop policy if exists "materials assigned task worker read" on materials;

create policy "worker area assignments own or admin read"
on worker_area_assignments
for select to authenticated
using (app_private.is_admin() or worker_id = app_private.current_worker_id());

create policy "worker area assignments admin manage"
on worker_area_assignments
for all to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

create policy "admin notifications admin read"
on admin_notifications
for select to authenticated
using (app_private.is_admin());

create policy "admin notifications admin manage"
on admin_notifications
for all to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

create policy "areas assigned worker read"
on areas
for select to authenticated
using (
  app_private.is_admin()
  or exists (
    select 1
    from worker_area_assignments waa
    where waa.area_id = areas.id
      and waa.worker_id = app_private.current_worker_id()
  )
);

create policy "production lines assigned worker read"
on production_lines
for select to authenticated
using (
  app_private.is_admin()
  or exists (
    select 1
    from worker_area_assignments waa
    where waa.area_id = production_lines.area_id
      and waa.worker_id = app_private.current_worker_id()
  )
);

create policy "equipment assigned worker read"
on equipment
for select to authenticated
using (
  app_private.is_admin()
  or exists (
    select 1
    from worker_area_assignments waa
    where waa.area_id = equipment.area_id
      and waa.worker_id = app_private.current_worker_id()
  )
  or exists (
    select 1
    from planned_tasks pt
    where pt.equipment_id = equipment.id
      and app_private.can_access_task(pt)
  )
);

create policy "maintenance points assigned task worker read"
on maintenance_points
for select to authenticated
using (
  app_private.is_admin()
  or exists (
    select 1
    from planned_tasks pt
    where pt.maintenance_point_id = maintenance_points.id
      and app_private.can_access_task(pt)
  )
);

create policy "materials assigned task worker read"
on materials
for select to authenticated
using (
  app_private.is_admin()
  or exists (
    select 1
    from planned_tasks pt
    where pt.material_id = materials.id
      and app_private.can_access_task(pt)
  )
);

drop policy if exists "execution reports worker insert" on execution_reports;
create policy "execution reports worker insert"
on execution_reports
for insert to authenticated
with check (
  app_private.is_admin()
  or (
    worker_id = app_private.current_worker_id()
    and exists (
      select 1
      from planned_tasks pt
      where pt.id = task_id
        and app_private.can_access_task(pt)
    )
  )
);

drop policy if exists "non execution worker insert" on non_execution_reports;
create policy "non execution worker insert"
on non_execution_reports
for insert to authenticated
with check (
  app_private.is_admin()
  or (
    worker_id = app_private.current_worker_id()
    and exists (
      select 1
      from planned_tasks pt
      where pt.id = task_id
        and app_private.can_access_task(pt)
    )
  )
);

notify pgrst, 'reload schema';
