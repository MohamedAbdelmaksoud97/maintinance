create extension if not exists pgcrypto;

create schema if not exists app_private;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'worker' check (role in ('admin', 'worker')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete set null,
  employee_code text unique,
  full_name text not null,
  mobile text,
  job_title text,
  default_area_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists areas (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists production_lines (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id) on delete cascade,
  line_code text not null,
  name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id, line_code)
);

alter table workers
  add constraint workers_default_area_id_fkey
  foreign key (default_area_id) references areas(id) on delete set null;

create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references areas(id) on delete set null,
  production_line_id uuid references production_lines(id) on delete set null,
  equipment_code text not null,
  name text,
  description text,
  original_values jsonb not null default '{}'::jsonb,
  data_quality_status text not null default 'NEEDS_REVIEW' check (data_quality_status in ('COMPLETE', 'MISSING_DATA', 'NEEDS_REVIEW', 'INVALID')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id, equipment_code)
);

create table if not exists maintenance_work_types (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists task_statuses (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  is_terminal boolean not null default false,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assignment_statuses (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_details jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  material_kind text not null check (material_kind in ('oil', 'grease')),
  code text,
  name text not null,
  brand text,
  grade text,
  unit text,
  supplier_id uuid references suppliers(id) on delete set null,
  minimum_stock numeric,
  reorder_level numeric,
  original_values jsonb not null default '{}'::jsonb,
  data_quality_status text not null default 'NEEDS_REVIEW' check (data_quality_status in ('COMPLETE', 'MISSING_DATA', 'NEEDS_REVIEW', 'INVALID')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_kind, code),
  unique (material_kind, name, brand, grade)
);

create table if not exists material_prices (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  price numeric not null check (price >= 0),
  currency text not null default 'SAR',
  effective_from date not null,
  effective_to date,
  supplier_id uuid references suppliers(id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists maintenance_points (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  work_type_id uuid references maintenance_work_types(id) on delete set null,
  material_id uuid references materials(id) on delete set null,
  point_name text,
  part_description text,
  execution_condition text not null default 'configurable' check (execution_condition in ('running', 'shutdown', 'configurable')),
  quantity numeric,
  quantity_unit text,
  running_hours_per_day numeric,
  frequency_hours numeric,
  frequency_days numeric,
  last_change_date date,
  last_inspection_date date,
  last_grease_date date,
  original_values jsonb not null default '{}'::jsonb,
  data_quality_status text not null default 'NEEDS_REVIEW' check (data_quality_status in ('COMPLETE', 'MISSING_DATA', 'NEEDS_REVIEW', 'INVALID')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists annual_plans (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references areas(id) on delete set null,
  plan_year integer not null,
  material_kind text not null check (material_kind in ('oil', 'grease')),
  source_file text,
  status text not null default 'imported',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id, plan_year, material_kind, source_file)
);

create table if not exists annual_plan_items (
  id uuid primary key default gen_random_uuid(),
  annual_plan_id uuid not null references annual_plans(id) on delete cascade,
  maintenance_point_id uuid references maintenance_points(id) on delete set null,
  source_row_id uuid,
  planned_quantity numeric,
  planned_quantity_unit text,
  frequency_hours numeric,
  frequency_days numeric,
  original_values jsonb not null default '{}'::jsonb,
  data_quality_status text not null default 'NEEDS_REVIEW' check (data_quality_status in ('COMPLETE', 'MISSING_DATA', 'NEEDS_REVIEW', 'INVALID')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists planned_tasks (
  id uuid primary key default gen_random_uuid(),
  annual_plan_item_id uuid references annual_plan_items(id) on delete set null,
  equipment_id uuid references equipment(id) on delete set null,
  maintenance_point_id uuid references maintenance_points(id) on delete set null,
  work_type_id uuid references maintenance_work_types(id) on delete set null,
  material_id uuid references materials(id) on delete set null,
  status_id uuid references task_statuses(id) on delete restrict,
  assignment_status_id uuid references assignment_statuses(id) on delete restrict,
  main_worker_id uuid references workers(id) on delete set null,
  original_due_date date not null,
  scheduled_date date not null,
  started_at timestamptz,
  completed_at timestamptz,
  execution_condition text not null default 'configurable' check (execution_condition in ('running', 'shutdown', 'configurable')),
  planned_quantity numeric,
  planned_quantity_unit text,
  task_cost numeric,
  source_row_id uuid,
  original_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((main_worker_id is null) or (assignment_status_id is not null))
);

create table if not exists task_assistants (
  task_id uuid not null references planned_tasks(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  assigned_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, worker_id)
);

create table if not exists task_assignment_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references planned_tasks(id) on delete cascade,
  previous_worker_id uuid references workers(id) on delete set null,
  new_worker_id uuid references workers(id) on delete set null,
  assigned_by uuid references profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists task_reschedules (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references planned_tasks(id) on delete cascade,
  previous_date date not null,
  new_date date not null,
  rescheduled_by uuid references profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists execution_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references planned_tasks(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete restrict,
  started_at timestamptz,
  completed_at timestamptz not null default now(),
  notes text,
  discovered_issues text,
  photo_paths text[] not null default '{}',
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists report_materials (
  id uuid primary key default gen_random_uuid(),
  execution_report_id uuid not null references execution_reports(id) on delete cascade,
  material_id uuid not null references materials(id) on delete restrict,
  quantity numeric not null check (quantity >= 0),
  unit text,
  unit_price numeric,
  total_cost numeric generated always as (coalesce(quantity, 0) * coalesce(unit_price, 0)) stored,
  inventory_transaction_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists non_execution_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references planned_tasks(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete restrict,
  reason text not null,
  evidence_paths text[] not null default '{}',
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists troubleshooting_reports (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid references equipment(id) on delete set null,
  maintenance_point_id uuid references maintenance_points(id) on delete set null,
  issue text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  overtime_hours numeric,
  overtime_rate numeric,
  additional_expenses numeric,
  result text,
  photo_paths text[] not null default '{}',
  created_by uuid references profiles(id) on delete set null,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists troubleshooting_assignees (
  report_id uuid not null references troubleshooting_reports(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, worker_id)
);

create table if not exists troubleshooting_materials (
  id uuid primary key default gen_random_uuid(),
  troubleshooting_report_id uuid not null references troubleshooting_reports(id) on delete cascade,
  material_id uuid not null references materials(id) on delete restrict,
  quantity numeric not null check (quantity >= 0),
  unit text,
  unit_price numeric,
  total_cost numeric generated always as (coalesce(quantity, 0) * coalesce(unit_price, 0)) stored,
  inventory_transaction_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('opening', 'purchase', 'adjustment_in', 'adjustment_out', 'planned_consumption', 'troubleshooting_consumption')),
  quantity numeric not null,
  unit text,
  unit_price numeric,
  transaction_date timestamptz not null default now(),
  source_type text,
  source_id uuid,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table report_materials
  add constraint report_materials_inventory_transaction_id_fkey
  foreign key (inventory_transaction_id) references inventory_transactions(id) on delete set null;

alter table troubleshooting_materials
  add constraint troubleshooting_materials_inventory_transaction_id_fkey
  foreign key (inventory_transaction_id) references inventory_transactions(id) on delete set null;

create table if not exists production_periods (
  id uuid primary key default gen_random_uuid(),
  production_line_id uuid references production_lines(id) on delete cascade,
  period_type text not null check (period_type in ('running', 'shutdown')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  description text,
  source_row_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create table if not exists notification_queue (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  task_id uuid references planned_tasks(id) on delete cascade,
  notification_type text not null default 'daily_task',
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  source_root text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb
);

create table if not exists import_files (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches(id) on delete cascade,
  source_path text not null,
  source_name text not null,
  source_kind text not null,
  area_name text,
  material_kind text,
  plan_year integer,
  sheet_count integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists imported_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches(id) on delete cascade,
  import_file_id uuid not null references import_files(id) on delete cascade,
  sheet_name text not null,
  sheet_index integer not null,
  row_number integer not null,
  row_data jsonb not null,
  normalized_table text,
  normalized_id uuid,
  quality_status text not null default 'NEEDS_REVIEW' check (quality_status in ('COMPLETE', 'MISSING_DATA', 'NEEDS_REVIEW', 'INVALID')),
  created_at timestamptz not null default now(),
  unique (import_file_id, sheet_index, row_number)
);

alter table annual_plan_items
  add constraint annual_plan_items_source_row_id_fkey
  foreign key (source_row_id) references imported_rows(id) on delete set null;

alter table planned_tasks
  add constraint planned_tasks_source_row_id_fkey
  foreign key (source_row_id) references imported_rows(id) on delete set null;

alter table production_periods
  add constraint production_periods_source_row_id_fkey
  foreign key (source_row_id) references imported_rows(id) on delete set null;

create table if not exists data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  imported_row_id uuid references imported_rows(id) on delete cascade,
  entity_table text,
  entity_id uuid,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'error')),
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  issue_code text not null,
  message text not null,
  resolved_by uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_table text,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

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
  select id
  from workers
  where profile_id = auth.uid()
    and is_active = true
  limit 1;
$$;

create or replace function app_private.can_access_task(task_row planned_tasks)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select app_private.is_admin()
    or task_row.main_worker_id = app_private.current_worker_id()
    or exists (
      select 1
      from task_assistants
      where task_assistants.task_id = task_row.id
        and task_assistants.worker_id = app_private.current_worker_id()
    );
$$;

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_admin() to authenticated;
grant execute on function app_private.current_worker_id() to authenticated;
grant execute on function app_private.can_access_task(planned_tasks) to authenticated;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function create_assignment_history()
returns trigger
language plpgsql
as $$
begin
  if old.main_worker_id is distinct from new.main_worker_id then
    insert into task_assignment_history (task_id, previous_worker_id, new_worker_id, assigned_by, reason)
    values (new.id, old.main_worker_id, new.main_worker_id, auth.uid(), 'Assignment changed');
  end if;
  return new;
end;
$$;

create or replace function create_reschedule_history()
returns trigger
language plpgsql
as $$
begin
  if old.scheduled_date is distinct from new.scheduled_date then
    insert into task_reschedules (task_id, previous_date, new_date, rescheduled_by, reason)
    values (new.id, old.scheduled_date, new.scheduled_date, auth.uid(), 'Schedule changed');
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','workers','areas','production_lines','equipment','maintenance_work_types',
    'task_statuses','assignment_statuses','suppliers','materials','maintenance_points',
    'annual_plans','annual_plan_items','planned_tasks','execution_reports',
    'non_execution_reports','troubleshooting_reports','production_periods'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on %I', table_name);
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at()', table_name);
  end loop;
end $$;

drop trigger if exists planned_tasks_assignment_history on planned_tasks;
create trigger planned_tasks_assignment_history
after update of main_worker_id on planned_tasks
for each row execute function create_assignment_history();

drop trigger if exists planned_tasks_reschedule_history on planned_tasks;
create trigger planned_tasks_reschedule_history
after update of scheduled_date on planned_tasks
for each row execute function create_reschedule_history();

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
group by m.id;

alter view material_stock set (security_invoker = true);

create index if not exists equipment_area_code_idx on equipment(area_id, equipment_code);
create index if not exists maintenance_points_equipment_idx on maintenance_points(equipment_id);
create index if not exists planned_tasks_scheduled_date_idx on planned_tasks(scheduled_date);
create index if not exists planned_tasks_main_worker_idx on planned_tasks(main_worker_id);
create index if not exists imported_rows_batch_quality_idx on imported_rows(batch_id, quality_status);
create index if not exists inventory_transactions_material_date_idx on inventory_transactions(material_id, transaction_date);

alter table profiles enable row level security;
alter table workers enable row level security;
alter table areas enable row level security;
alter table production_lines enable row level security;
alter table equipment enable row level security;
alter table maintenance_work_types enable row level security;
alter table task_statuses enable row level security;
alter table assignment_statuses enable row level security;
alter table suppliers enable row level security;
alter table materials enable row level security;
alter table material_prices enable row level security;
alter table maintenance_points enable row level security;
alter table annual_plans enable row level security;
alter table annual_plan_items enable row level security;
alter table planned_tasks enable row level security;
alter table task_assistants enable row level security;
alter table task_assignment_history enable row level security;
alter table task_reschedules enable row level security;
alter table execution_reports enable row level security;
alter table report_materials enable row level security;
alter table non_execution_reports enable row level security;
alter table troubleshooting_reports enable row level security;
alter table troubleshooting_assignees enable row level security;
alter table troubleshooting_materials enable row level security;
alter table inventory_transactions enable row level security;
alter table production_periods enable row level security;
alter table notification_queue enable row level security;
alter table import_batches enable row level security;
alter table import_files enable row level security;
alter table imported_rows enable row level security;
alter table data_quality_issues enable row level security;
alter table audit_logs enable row level security;

create policy "profiles self read" on profiles for select to authenticated using (id = auth.uid() or app_private.is_admin());
create policy "profiles admin manage" on profiles for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());

create policy "workers self or admin read" on workers for select to authenticated using (profile_id = auth.uid() or app_private.is_admin());
create policy "workers admin manage" on workers for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());

create policy "reference admin read" on areas for select to authenticated using (app_private.is_admin());
create policy "reference admin manage" on areas for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "production lines admin read" on production_lines for select to authenticated using (app_private.is_admin());
create policy "production lines admin manage" on production_lines for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "equipment admin read" on equipment for select to authenticated using (app_private.is_admin());
create policy "equipment admin manage" on equipment for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "maintenance points admin read" on maintenance_points for select to authenticated using (app_private.is_admin());
create policy "maintenance points admin manage" on maintenance_points for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());

create policy "lookup authenticated read" on maintenance_work_types for select to authenticated using (true);
create policy "lookup admin manage" on maintenance_work_types for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "task statuses authenticated read" on task_statuses for select to authenticated using (true);
create policy "task statuses admin manage" on task_statuses for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "assignment statuses authenticated read" on assignment_statuses for select to authenticated using (true);
create policy "assignment statuses admin manage" on assignment_statuses for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());

create policy "materials admin read" on materials for select to authenticated using (app_private.is_admin());
create policy "materials admin manage" on materials for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "suppliers admin read" on suppliers for select to authenticated using (app_private.is_admin());
create policy "suppliers admin manage" on suppliers for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "material prices admin read" on material_prices for select to authenticated using (app_private.is_admin());
create policy "material prices admin manage" on material_prices for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "inventory admin read" on inventory_transactions for select to authenticated using (app_private.is_admin());
create policy "inventory admin manage" on inventory_transactions for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());

create policy "plans admin read" on annual_plans for select to authenticated using (app_private.is_admin());
create policy "plans admin manage" on annual_plans for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "plan items admin read" on annual_plan_items for select to authenticated using (app_private.is_admin());
create policy "plan items admin manage" on annual_plan_items for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());

create policy "planned tasks assignee or admin read" on planned_tasks for select to authenticated using (app_private.can_access_task(planned_tasks));
create policy "planned tasks admin manage" on planned_tasks for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "task assistants assignee or admin read" on task_assistants for select to authenticated using (app_private.is_admin() or worker_id = app_private.current_worker_id());
create policy "task assistants admin manage" on task_assistants for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "assignment history admin read" on task_assignment_history for select to authenticated using (app_private.is_admin());
create policy "assignment history admin insert" on task_assignment_history for insert to authenticated with check (app_private.is_admin());
create policy "reschedules admin read" on task_reschedules for select to authenticated using (app_private.is_admin());
create policy "reschedules admin insert" on task_reschedules for insert to authenticated with check (app_private.is_admin());

create policy "execution reports task access read" on execution_reports for select to authenticated using (
  app_private.is_admin()
  or exists (select 1 from planned_tasks where planned_tasks.id = execution_reports.task_id and app_private.can_access_task(planned_tasks))
);
create policy "execution reports worker insert" on execution_reports for insert to authenticated with check (
  app_private.is_admin()
  or worker_id = app_private.current_worker_id()
);
create policy "execution reports worker update own pending" on execution_reports for update to authenticated using (
  app_private.is_admin()
  or (worker_id = app_private.current_worker_id() and approval_status = 'pending')
) with check (
  app_private.is_admin()
  or (worker_id = app_private.current_worker_id() and approval_status = 'pending')
);

create policy "report materials report access read" on report_materials for select to authenticated using (
  app_private.is_admin()
  or exists (
    select 1
    from execution_reports er
    join planned_tasks pt on pt.id = er.task_id
    where er.id = report_materials.execution_report_id
      and app_private.can_access_task(pt)
  )
);
create policy "report materials worker insert" on report_materials for insert to authenticated with check (
  app_private.is_admin()
  or exists (
    select 1
    from execution_reports er
    where er.id = report_materials.execution_report_id
      and er.worker_id = app_private.current_worker_id()
      and er.approval_status = 'pending'
  )
);

create policy "non execution task access read" on non_execution_reports for select to authenticated using (
  app_private.is_admin()
  or exists (select 1 from planned_tasks where planned_tasks.id = non_execution_reports.task_id and app_private.can_access_task(planned_tasks))
);
create policy "non execution worker insert" on non_execution_reports for insert to authenticated with check (
  app_private.is_admin()
  or worker_id = app_private.current_worker_id()
);

create policy "troubleshooting admin read" on troubleshooting_reports for select to authenticated using (
  app_private.is_admin()
  or created_by = auth.uid()
  or exists (
    select 1 from troubleshooting_assignees
    where troubleshooting_assignees.report_id = troubleshooting_reports.id
      and troubleshooting_assignees.worker_id = app_private.current_worker_id()
  )
);
create policy "troubleshooting authenticated insert" on troubleshooting_reports for insert to authenticated with check (created_by = auth.uid() or app_private.is_admin());
create policy "troubleshooting admin update" on troubleshooting_reports for update to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "troubleshooting assignees read" on troubleshooting_assignees for select to authenticated using (app_private.is_admin() or worker_id = app_private.current_worker_id());
create policy "troubleshooting assignees admin manage" on troubleshooting_assignees for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "troubleshooting materials admin read" on troubleshooting_materials for select to authenticated using (app_private.is_admin());
create policy "troubleshooting materials admin manage" on troubleshooting_materials for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());

create policy "production periods admin read" on production_periods for select to authenticated using (app_private.is_admin());
create policy "production periods admin manage" on production_periods for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "notifications own or admin read" on notification_queue for select to authenticated using (app_private.is_admin() or worker_id = app_private.current_worker_id());
create policy "notifications admin manage" on notification_queue for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());

create policy "imports admin read" on import_batches for select to authenticated using (app_private.is_admin());
create policy "imports admin manage" on import_batches for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "import files admin read" on import_files for select to authenticated using (app_private.is_admin());
create policy "import files admin manage" on import_files for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "import rows admin read" on imported_rows for select to authenticated using (app_private.is_admin());
create policy "import rows admin manage" on imported_rows for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "data quality admin read" on data_quality_issues for select to authenticated using (app_private.is_admin());
create policy "data quality admin manage" on data_quality_issues for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy "audit admin read" on audit_logs for select to authenticated using (app_private.is_admin());
create policy "audit admin insert" on audit_logs for insert to authenticated with check (app_private.is_admin());

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on material_stock to authenticated;
