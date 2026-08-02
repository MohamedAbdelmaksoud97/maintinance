alter table public.planned_tasks
  add column if not exists is_urgent boolean not null default false,
  add column if not exists urgent_parent_task_id uuid null references public.planned_tasks(id) on delete set null,
  add column if not exists urgent_attempt_no integer not null default 0;

alter table public.non_execution_reports
  add column if not exists reassigned_task_id uuid null references public.planned_tasks(id) on delete set null;

create index if not exists planned_tasks_is_urgent_idx
on public.planned_tasks(is_urgent)
where is_urgent = true;

create index if not exists planned_tasks_urgent_parent_idx
on public.planned_tasks(urgent_parent_task_id);

create index if not exists non_execution_reports_reassigned_task_idx
on public.non_execution_reports(reassigned_task_id);

insert into public.task_statuses (code, name, is_terminal, sort_order)
values ('REASSIGNED', U&'\062A\0645 \062A\062D\0648\064A\0644\0647\0627 \0644\0645\0647\0645\0629 \0639\0627\062C\0644\0629', true, 450)
on conflict (code) do update set
  name = excluded.name,
  is_terminal = excluded.is_terminal,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

create or replace function public.assign_urgent_planned_task(
  target_task_id uuid,
  target_worker_id uuid,
  scheduled_date_value date default (timezone('Asia/Riyadh', now()))::date,
  reason_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_task public.planned_tasks%rowtype;
  report_row public.non_execution_reports%rowtype;
  planned_status_id uuid;
  assigned_status_id uuid;
  reassigned_status_id uuid;
  new_task_id uuid;
  next_attempt integer;
  scheduled_for_value timestamptz;
begin
  if not app_private.is_admin() then
    raise exception 'Only admins can assign urgent planned tasks';
  end if;

  if target_task_id is null or target_worker_id is null then
    raise exception 'Task and worker are required';
  end if;

  if scheduled_date_value is null then
    scheduled_date_value := (timezone('Asia/Riyadh', now()))::date;
  end if;

  select *
  into source_task
  from public.planned_tasks
  where id = target_task_id
  limit 1;

  if source_task.id is null then
    raise exception 'Task was not found';
  end if;

  select *
  into report_row
  from public.non_execution_reports
  where task_id = target_task_id
    and approval_status = 'pending'
    and reassigned_task_id is null
  order by created_at desc
  limit 1;

  if report_row.id is null then
    raise exception 'No pending non-execution report is available for this task';
  end if;

  if not exists (select 1 from public.workers where id = target_worker_id and is_active = true) then
    raise exception 'Selected worker is not active';
  end if;

  select id into planned_status_id from public.task_statuses where code = 'PLANNED' limit 1;
  if planned_status_id is null then
    select id into planned_status_id from public.task_statuses where code = 'NEEDS_ASSIGNMENT' limit 1;
  end if;
  select id into assigned_status_id from public.assignment_statuses where code = 'ASSIGNED' limit 1;
  select id into reassigned_status_id from public.task_statuses where code = 'REASSIGNED' limit 1;

  if planned_status_id is null or assigned_status_id is null or reassigned_status_id is null then
    raise exception 'Required task statuses are missing';
  end if;

  next_attempt := greatest(coalesce(source_task.urgent_attempt_no, 0) + 1, 1);

  insert into public.planned_tasks (
    annual_plan_item_id,
    equipment_id,
    maintenance_point_id,
    work_type_id,
    material_id,
    status_id,
    assignment_status_id,
    main_worker_id,
    original_due_date,
    scheduled_date,
    execution_condition,
    planned_quantity,
    planned_quantity_unit,
    task_cost,
    source_row_id,
    original_values,
    is_urgent,
    urgent_parent_task_id,
    urgent_attempt_no
  )
  values (
    source_task.annual_plan_item_id,
    source_task.equipment_id,
    source_task.maintenance_point_id,
    source_task.work_type_id,
    source_task.material_id,
    planned_status_id,
    assigned_status_id,
    target_worker_id,
    source_task.original_due_date,
    scheduled_date_value,
    source_task.execution_condition,
    source_task.planned_quantity,
    source_task.planned_quantity_unit,
    source_task.task_cost,
    source_task.source_row_id,
    coalesce(source_task.original_values, '{}'::jsonb) || jsonb_build_object(
      'source_mode', 'urgent_reassignment',
      'urgent_parent_task_id', source_task.id,
      'original_task_id', coalesce(source_task.original_values->>'original_task_id', source_task.id::text),
      'original_scheduled_date', source_task.scheduled_date,
      'urgent_scheduled_date', scheduled_date_value,
      'non_execution_report_id', report_row.id,
      'previous_worker_id', source_task.main_worker_id,
      'reassigned_worker_id', target_worker_id,
      'reassigned_by', auth.uid(),
      'reassigned_at', now(),
      'urgent_attempt_no', next_attempt,
      'reassignment_reason', reason_value
    ),
    true,
    source_task.id,
    next_attempt
  )
  returning id into new_task_id;

  update public.non_execution_reports
  set reassigned_task_id = new_task_id,
      approval_status = 'approved',
      updated_at = now()
  where id = report_row.id;

  update public.planned_tasks
  set status_id = reassigned_status_id,
      updated_at = now()
  where id = source_task.id;

  update public.admin_notifications
  set status = 'resolved',
      read_at = coalesce(read_at, now()),
      payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
        'urgent_task_id', new_task_id,
        'reassigned_worker_id', target_worker_id,
        'urgent_scheduled_date', scheduled_date_value
      )
  where task_id = source_task.id
    and notification_type = 'non_execution_reason'
    and status = 'pending';

  scheduled_for_value := greatest(
    (scheduled_date_value::text || 'T09:00:00+03:00')::timestamptz,
    now()
  );

  insert into public.notification_queue (
    worker_id,
    task_id,
    notification_type,
    scheduled_for,
    payload
  )
  values (
    target_worker_id,
    new_task_id,
    'urgent_planned_task',
    scheduled_for_value,
    jsonb_build_object(
      'message_ar', U&'\062A\0645 \0625\0633\0646\0627\062F \0645\0647\0645\0629 \062E\0637\0629 \0639\0627\062C\0644\0629 \0644\0643',
      'task_id', new_task_id,
      'original_task_id', source_task.id,
      'scheduled_date', scheduled_date_value,
      'urgent_attempt_no', next_attempt,
      'reason', reason_value
    )
  );

  return jsonb_build_object(
    'urgent_task_id', new_task_id,
    'source_task_id', source_task.id,
    'worker_id', target_worker_id,
    'scheduled_date', scheduled_date_value,
    'urgent_attempt_no', next_attempt
  );
end;
$$;

revoke execute on function public.assign_urgent_planned_task(uuid, uuid, date, text) from public, anon;
grant execute on function public.assign_urgent_planned_task(uuid, uuid, date, text) to authenticated;

create or replace function app_private.resolve_urgent_task_chain_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completed_at is null then
    return new;
  end if;

  with recursive task_chain as (
    select new.id as id, new.urgent_parent_task_id
    union all
    select pt.id, pt.urgent_parent_task_id
    from public.planned_tasks pt
    join task_chain tc on pt.id = tc.urgent_parent_task_id
    where tc.urgent_parent_task_id is not null
  )
  update public.admin_notifications an
  set status = 'resolved',
      read_at = coalesce(an.read_at, now())
  where an.status = 'pending'
    and an.task_id in (select id from task_chain);

  return new;
end;
$$;

drop trigger if exists planned_tasks_resolve_urgent_chain on public.planned_tasks;
create trigger planned_tasks_resolve_urgent_chain
after update of completed_at on public.planned_tasks
for each row
when (new.completed_at is not null and old.completed_at is distinct from new.completed_at)
execute function app_private.resolve_urgent_task_chain_on_completion();
