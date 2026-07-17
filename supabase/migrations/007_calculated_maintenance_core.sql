insert into maintenance_work_types (code, name, description)
values
  ('grease_change', 'تغيير شحم', 'تغيير الشحم الكامل حسب ساعات التشغيل')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = now();

create table if not exists shutdown_windows (
  id uuid primary key default gen_random_uuid(),
  line_code text not null,
  starts_on date not null,
  ends_on date not null,
  description text,
  source_file text,
  source_sheet text,
  plan_year integer,
  original_values jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (line_code, starts_on, ends_on)
);

drop trigger if exists set_updated_at on shutdown_windows;
create trigger set_updated_at
before update on shutdown_windows
for each row execute function set_updated_at();

create index if not exists shutdown_windows_line_dates_idx on shutdown_windows(line_code, starts_on, ends_on);

alter table shutdown_windows enable row level security;

drop policy if exists "shutdown windows admin read" on shutdown_windows;
create policy "shutdown windows admin read"
on shutdown_windows for select to authenticated
using (app_private.is_admin());

drop policy if exists "shutdown windows admin manage" on shutdown_windows;
create policy "shutdown windows admin manage"
on shutdown_windows for all to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

grant select, insert, update, delete on shutdown_windows to authenticated;
