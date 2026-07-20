do $$
begin
  alter publication supabase_realtime add table public.notification_queue;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.admin_notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

create index if not exists troubleshooting_assignees_worker_report_idx
on public.troubleshooting_assignees(worker_id, report_id);

create index if not exists troubleshooting_reports_open_worker_view_idx
on public.troubleshooting_reports(status, scheduled_date, updated_at desc)
where status in ('open', 'in_progress');

create or replace function public.get_my_open_adhoc_tasks()
returns table (
  id uuid,
  issue text,
  priority text,
  status text,
  scheduled_date date,
  started_at timestamptz,
  ended_at timestamptz,
  result text,
  photo_paths text[],
  updated_at timestamptz,
  equipment_code text,
  equipment_name text,
  area_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    tr.id,
    tr.issue,
    tr.priority,
    tr.status,
    tr.scheduled_date,
    tr.started_at,
    tr.ended_at,
    tr.result,
    coalesce(tr.photo_paths, '{}'::text[]) as photo_paths,
    tr.updated_at,
    e.equipment_code,
    e.name as equipment_name,
    a.name as area_name
  from public.troubleshooting_reports tr
  join public.troubleshooting_assignees ta on ta.report_id = tr.id
  left join public.equipment e on e.id = tr.equipment_id
  left join public.areas a on a.id = e.area_id
  where ta.worker_id = app_private.current_worker_id()
    and tr.status in ('open', 'in_progress')
  order by
    case when tr.scheduled_date = (timezone('Asia/Riyadh', now()))::date then 0 else 1 end,
    case tr.priority
      when 'urgent' then 0
      when 'high' then 1
      when 'normal' then 2
      else 3
    end,
    tr.scheduled_date nulls last,
    tr.updated_at desc;
$$;

revoke execute on function public.get_my_open_adhoc_tasks() from public, anon;
grant execute on function public.get_my_open_adhoc_tasks() to authenticated;

notify pgrst, 'reload schema';
