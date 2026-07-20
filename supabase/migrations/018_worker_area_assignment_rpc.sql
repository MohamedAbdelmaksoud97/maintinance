create index if not exists planned_tasks_equipment_date_open_idx
on public.planned_tasks (equipment_id, scheduled_date)
where completed_at is null;

create or replace function public.set_worker_area_assignments(
  target_worker_id uuid,
  target_area_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_status_id uuid;
  unassigned_status_id uuid;
  requested_area_ids uuid[] := '{}'::uuid[];
  previous_area_ids uuid[] := '{}'::uuid[];
  impacted_area_ids uuid[] := '{}'::uuid[];
  inserted_area_count integer := 0;
  assigned_task_count integer := 0;
  unassigned_task_count integer := 0;
begin
  if not app_private.is_admin() then
    raise exception 'Only admins can assign worker areas';
  end if;

  if target_worker_id is null then
    raise exception 'Worker is required';
  end if;

  if not exists (select 1 from public.workers where id = target_worker_id) then
    raise exception 'Worker was not found';
  end if;

  select coalesce(array_agg(distinct area_id), '{}'::uuid[])
  into previous_area_ids
  from public.worker_area_assignments
  where worker_id = target_worker_id;

  select coalesce(array_agg(distinct a.id), '{}'::uuid[])
  into requested_area_ids
  from public.areas a
  where a.is_active = true
    and a.id = any(coalesce(target_area_ids, '{}'::uuid[]));

  select coalesce(array_agg(distinct area_id), '{}'::uuid[])
  into impacted_area_ids
  from (
    select unnest(previous_area_ids) as area_id
    union
    select unnest(requested_area_ids) as area_id
  ) impacted;

  delete from public.worker_area_assignments
  where worker_id = target_worker_id
     or area_id = any(requested_area_ids);

  if cardinality(requested_area_ids) > 0 then
    insert into public.worker_area_assignments (worker_id, area_id, assigned_by)
    select target_worker_id, area_id, auth.uid()
    from unnest(requested_area_ids) area_id;

    get diagnostics inserted_area_count = row_count;

    update public.workers
    set default_area_id = requested_area_ids[1],
        updated_at = now()
    where id = target_worker_id;
  else
    update public.workers
    set default_area_id = null,
        updated_at = now()
    where id = target_worker_id;
  end if;

  select id into assigned_status_id from public.assignment_statuses where code = 'ASSIGNED' limit 1;
  select id into unassigned_status_id from public.assignment_statuses where code = 'UNASSIGNED' limit 1;

  update public.planned_tasks pt
  set main_worker_id = waa.worker_id,
      assignment_status_id = assigned_status_id,
      original_values = coalesce(pt.original_values, '{}'::jsonb) || jsonb_build_object(
        'area_worker_assignment_refreshed_at', now(),
        'area_worker_assignment_source', 'set_worker_area_assignments'
      ),
      updated_at = now()
  from public.equipment e
  join public.worker_area_assignments waa on waa.area_id = e.area_id,
  public.task_statuses ts
  where pt.equipment_id = e.id
    and ts.id = pt.status_id
    and e.area_id = any(impacted_area_ids)
    and pt.scheduled_date >= (timezone('Asia/Riyadh', now()))::date
    and pt.completed_at is null
    and ts.is_terminal = false
    and not exists (select 1 from public.execution_reports er where er.task_id = pt.id)
    and not exists (select 1 from public.non_execution_reports ner where ner.task_id = pt.id)
    and pt.main_worker_id is distinct from waa.worker_id;

  get diagnostics assigned_task_count = row_count;

  update public.planned_tasks pt
  set main_worker_id = null,
      assignment_status_id = unassigned_status_id,
      original_values = coalesce(pt.original_values, '{}'::jsonb) || jsonb_build_object(
        'area_worker_assignment_refreshed_at', now(),
        'area_worker_assignment_source', 'set_worker_area_assignments',
        'area_worker_assignment_missing_owner', true
      ),
      updated_at = now()
  from public.equipment e
  cross join public.task_statuses ts
  where pt.equipment_id = e.id
    and ts.id = pt.status_id
    and e.area_id = any(impacted_area_ids)
    and not exists (
      select 1
      from public.worker_area_assignments waa
      where waa.area_id = e.area_id
    )
    and pt.scheduled_date >= (timezone('Asia/Riyadh', now()))::date
    and pt.completed_at is null
    and ts.is_terminal = false
    and pt.main_worker_id is not null
    and not exists (select 1 from public.execution_reports er where er.task_id = pt.id)
    and not exists (select 1 from public.non_execution_reports ner where ner.task_id = pt.id);

  get diagnostics unassigned_task_count = row_count;

  return jsonb_build_object(
    'worker_id', target_worker_id,
    'area_count', inserted_area_count,
    'assigned_tasks', assigned_task_count,
    'unassigned_tasks', unassigned_task_count
  );
end;
$$;

revoke execute on function public.set_worker_area_assignments(uuid, uuid[]) from public, anon;
grant execute on function public.set_worker_area_assignments(uuid, uuid[]) to authenticated;
