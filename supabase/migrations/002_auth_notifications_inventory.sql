alter table profiles
  add column if not exists approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists approved_by uuid references profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;

alter table workers
  add column if not exists approved_by uuid references profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;

update profiles
set approval_status = 'approved',
    approved_at = coalesce(approved_at, now())
where role = 'admin'
  and approval_status = 'pending';

create or replace function app_private.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and role = 'admin'
      and approval_status = 'approved'
      and is_active = true
  );
$$;

create or replace function app_private.current_worker_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select w.id
  from workers w
  join profiles p on p.id = w.profile_id
  where w.profile_id = auth.uid()
    and w.is_active = true
    and p.is_active = true
    and p.approval_status = 'approved'
  limit 1;
$$;

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_name text;
begin
  requested_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  insert into profiles (id, email, full_name, role, approval_status)
  values (new.id, new.email, requested_name, 'worker', 'pending')
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(profiles.full_name, excluded.full_name);

  insert into workers (profile_id, full_name, is_active)
  values (new.id, requested_name, false)
  on conflict (profile_id) do update
  set full_name = coalesce(workers.full_name, excluded.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function app_private.handle_new_user();

revoke all on function app_private.handle_new_user() from public, anon, authenticated;

create or replace function approve_worker(worker_profile_id uuid, approve boolean default true)
returns void
language plpgsql
security invoker
as $$
begin
  if not app_private.is_admin() then
    raise exception 'Only admins can approve workers';
  end if;

  update profiles
  set approval_status = case when approve then 'approved' else 'rejected' end,
      approved_by = auth.uid(),
      approved_at = now(),
      is_active = approve,
      updated_at = now()
  where id = worker_profile_id
    and role = 'worker';

  update workers
  set is_active = approve,
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  where profile_id = worker_profile_id;
end;
$$;

grant execute on function approve_worker(uuid, boolean) to authenticated;

create or replace function enqueue_daily_worker_notifications(target_date date default current_date)
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
      'Africa/Cairo'
    ),
    jsonb_build_object(
      'message_ar', 'لديك مهمة صيانة اليوم',
      'scheduled_date', pt.scheduled_date,
      'task_id', pt.id
    )
  from planned_tasks pt
  join task_statuses ts on ts.id = pt.status_id
  join assignment_statuses ast on ast.id = pt.assignment_status_id
  where pt.scheduled_date = target_date
    and pt.main_worker_id is not null
    and ts.code <> 'COMPLETED'
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

grant execute on function enqueue_daily_worker_notifications(date) to authenticated;

do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'daily-maintenance-task-notifications') then
      perform cron.unschedule('daily-maintenance-task-notifications');
    end if;

    perform cron.schedule(
      'daily-maintenance-task-notifications',
      '0 6 * * *',
      $cmd$select enqueue_daily_worker_notifications(current_date);$cmd$
    );
  end if;
exception
  when others then
    raise notice 'daily notification cron was not scheduled: %', sqlerrm;
end $do$;

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
join materials m on m.id = ms.material_id;

alter view material_stock_alerts set (security_invoker = true);

create or replace view troubleshooting_costs as
select
  tr.id as troubleshooting_report_id,
  tr.issue,
  tr.priority,
  tr.status,
  coalesce(sum(tm.total_cost), 0) as material_cost,
  coalesce(tr.overtime_hours, 0) * coalesce(tr.overtime_rate, 0) as overtime_cost,
  coalesce(tr.additional_expenses, 0) as additional_expenses,
  coalesce(sum(tm.total_cost), 0)
    + (coalesce(tr.overtime_hours, 0) * coalesce(tr.overtime_rate, 0))
    + coalesce(tr.additional_expenses, 0) as total_cost
from troubleshooting_reports tr
left join troubleshooting_materials tm on tm.troubleshooting_report_id = tr.id
group by tr.id;

alter view troubleshooting_costs set (security_invoker = true);

grant select on material_stock_alerts to authenticated;
grant select on troubleshooting_costs to authenticated;
