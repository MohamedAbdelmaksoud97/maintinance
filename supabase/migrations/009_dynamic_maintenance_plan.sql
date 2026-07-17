create schema if not exists extensions;
create extension if not exists pg_cron with schema extensions;

alter table public.maintenance_points
  add column if not exists schedule_anchor_date date,
  add column if not exists anchor_reason text,
  add column if not exists needs_data_review boolean not null default false,
  add column if not exists generation_horizon_until date,
  add column if not exists last_series_rescheduled_at timestamptz;

create index if not exists maintenance_points_quality_idx
on public.maintenance_points (data_quality_status, needs_data_review);

create index if not exists maintenance_points_horizon_idx
on public.maintenance_points (generation_horizon_until);

create index if not exists planned_tasks_point_date_idx
on public.planned_tasks (maintenance_point_id, scheduled_date);

create index if not exists planned_tasks_source_mode_idx
on public.planned_tasks ((original_values->>'source_mode'));

create or replace function app_private.safe_json_date(value text)
returns date
language plpgsql
immutable
as $$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return value::date;
exception when others then
  return null;
end;
$$;

create or replace function app_private.stable_uuid(value text)
returns uuid
language sql
immutable
as $$
  select (
    substr(md5(value), 1, 8) || '-' ||
    substr(md5(value), 9, 4) || '-' ||
    substr(md5(value), 13, 4) || '-' ||
    substr(md5(value), 17, 4) || '-' ||
    substr(md5(value), 21, 12)
  )::uuid;
$$;

create or replace function app_private.dynamic_step_days(
  frequency_days numeric,
  frequency_hours numeric,
  running_hours_per_day numeric
)
returns integer
language sql
immutable
as $$
  select case
    when frequency_days is not null and frequency_days > 0
      then greatest(1, floor(frequency_days)::int)
    when frequency_hours is not null and frequency_hours > 0
      and running_hours_per_day is not null and running_hours_per_day > 0
      then greatest(1, floor(frequency_hours / running_hours_per_day)::int)
    else null
  end;
$$;

create or replace function public.adjust_maintenance_due_date(
  raw_due date,
  line_code text,
  execution_condition text
)
returns date
language plpgsql
security invoker
as $$
declare
  adjusted date := raw_due;
  matching_window record;
begin
  if raw_due is null then
    return null;
  end if;

  if execution_condition = 'shutdown' then
    select starts_on, ends_on
    into matching_window
    from public.shutdown_windows
    where is_active = true
      and shutdown_windows.line_code = adjust_maintenance_due_date.line_code
      and ends_on >= raw_due
    order by
      case when raw_due between starts_on and ends_on then 0 else 1 end,
      starts_on
    limit 1;

    if matching_window.starts_on is null then
      return raw_due;
    end if;

    if raw_due between matching_window.starts_on and matching_window.ends_on then
      return raw_due;
    end if;

    return matching_window.starts_on;
  end if;

  loop
    select starts_on, ends_on
    into matching_window
    from public.shutdown_windows
    where is_active = true
      and shutdown_windows.line_code = adjust_maintenance_due_date.line_code
      and adjusted between starts_on and ends_on
    order by starts_on
    limit 1;

    exit when matching_window.starts_on is null;
    adjusted := matching_window.ends_on + 1;
  end loop;

  return adjusted;
end;
$$;

grant execute on function public.adjust_maintenance_due_date(date, text, text) to authenticated;

create or replace function public.extend_dynamic_maintenance_plan(
  target_start date default ((timezone('Asia/Riyadh', now()))::date),
  months_ahead integer default 12,
  target_maintenance_point_id uuid default null
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  horizon date := (target_start + make_interval(months => greatest(1, months_ahead)))::date;
  point_row record;
  anchor_date date;
  due_date date;
  previous_raw_due_date date;
  previous_scheduled_date date;
  v_scheduled_date date;
  step_days integer;
  v_line_code text;
  v_running_hours numeric;
  v_frequency_days numeric;
  v_frequency_hours numeric;
  plan_item_id uuid;
  needs_shutdown boolean;
  inserted_count integer := 0;
  reviewed_count integer := 0;
  skipped_count integer := 0;
  status_id uuid;
  assignment_status_id uuid;
  old_status_id uuid;
  task_id uuid;
begin
  select id into status_id from public.task_statuses where code = 'NEEDS_ASSIGNMENT' limit 1;
  select id into assignment_status_id from public.assignment_statuses where code = 'UNASSIGNED' limit 1;
  select id into old_status_id from public.task_statuses where code = 'OLD' limit 1;

  update public.planned_tasks pt
  set status_id = old_status_id,
      original_values = coalesce(original_values, '{}'::jsonb) || jsonb_build_object('outside_dynamic_horizon', true)
  where old_status_id is not null
    and pt.completed_at is null
    and pt.scheduled_date > horizon
    and (target_maintenance_point_id is null or pt.maintenance_point_id = target_maintenance_point_id)
    and pt.original_values->>'source_mode' in ('calculated_next_due', 'dynamic_plan')
    and not exists (select 1 from public.execution_reports er where er.task_id = pt.id);

  for point_row in
    select
      mp.*,
      wt.code as work_type_code,
      e.production_line_id,
      pl.line_code as production_line_code
    from public.maintenance_points mp
    join public.equipment e on e.id = mp.equipment_id
    left join public.production_lines pl on pl.id = e.production_line_id
    left join public.maintenance_work_types wt on wt.id = mp.work_type_id
    where mp.is_active = true
      and mp.original_values->>'source_mode' in ('calculated_next_due', 'manual_annual_plan')
      and (target_maintenance_point_id is null or mp.id = target_maintenance_point_id)
  loop
    reviewed_count := reviewed_count + 1;
    anchor_date := coalesce(
      point_row.schedule_anchor_date,
      point_row.last_inspection_date,
      point_row.last_change_date,
      point_row.last_grease_date,
      app_private.safe_json_date(point_row.original_values->>'last_date')
    );
    v_line_code := coalesce(point_row.production_line_code, point_row.original_values->>'line_code');
    v_running_hours := coalesce(point_row.running_hours_per_day, nullif(point_row.original_values->>'running_hours_per_day', '')::numeric);
    v_frequency_days := coalesce(point_row.frequency_days, nullif(point_row.original_values->>'frequency_days', '')::numeric);
    v_frequency_hours := coalesce(point_row.frequency_hours, nullif(point_row.original_values->>'frequency_hours', '')::numeric);
    step_days := app_private.dynamic_step_days(v_frequency_days, v_frequency_hours, v_running_hours);

    if anchor_date is null
      or step_days is null
      or v_running_hours is null
      or v_running_hours <= 0
    then
      update public.maintenance_points
      set data_quality_status = 'MISSING_DATA',
          needs_data_review = true,
          generation_horizon_until = null
      where id = point_row.id;
      skipped_count := skipped_count + 1;
      continue;
    end if;

    update public.maintenance_points
    set data_quality_status = 'COMPLETE',
        needs_data_review = false,
        schedule_anchor_date = anchor_date,
        generation_horizon_until = horizon,
        original_values = coalesce(original_values, '{}'::jsonb) || jsonb_build_object(
          'line_code', v_line_code,
          'step_days', step_days,
          'last_date', anchor_date,
          'frequency_days', v_frequency_days,
          'frequency_hours', v_frequency_hours,
          'running_hours_per_day', v_running_hours,
          'generation_horizon_until', horizon
        )
    where id = point_row.id;

    select id
    into plan_item_id
    from public.annual_plan_items
    where maintenance_point_id = point_row.id
    order by created_at desc
    limit 1;

    due_date := anchor_date + step_days;
    while due_date < target_start loop
      due_date := due_date + step_days;
    end loop;

    while due_date <= horizon loop
      previous_raw_due_date := due_date - step_days;
      previous_scheduled_date := public.adjust_maintenance_due_date(previous_raw_due_date, v_line_code, point_row.execution_condition);
      v_scheduled_date := public.adjust_maintenance_due_date(due_date, v_line_code, point_row.execution_condition);
      needs_shutdown := point_row.execution_condition = 'shutdown'
        and not exists (
          select 1
          from public.shutdown_windows sw
          where sw.is_active = true
            and sw.line_code = v_line_code
            and v_scheduled_date between sw.starts_on and sw.ends_on
        );
      task_id := app_private.stable_uuid('dynamic-task:' || point_row.id::text || ':' || v_scheduled_date::text);

      if not exists (
        select 1
        from public.planned_tasks pt
        left join public.task_statuses ts on ts.id = pt.status_id
        where pt.maintenance_point_id = point_row.id
          and pt.scheduled_date = v_scheduled_date
          and coalesce(ts.code, '') <> 'OLD'
      ) then
        insert into public.planned_tasks (
          id,
          annual_plan_item_id,
          equipment_id,
          maintenance_point_id,
          work_type_id,
          material_id,
          status_id,
          assignment_status_id,
          original_due_date,
          scheduled_date,
          execution_condition,
          planned_quantity,
          planned_quantity_unit,
          original_values
        )
        values (
          task_id,
          plan_item_id,
          point_row.equipment_id,
          point_row.id,
          point_row.work_type_id,
          point_row.material_id,
          status_id,
          assignment_status_id,
          due_date,
          v_scheduled_date,
          point_row.execution_condition,
          point_row.quantity,
          point_row.quantity_unit,
          jsonb_build_object(
            'source_mode', 'dynamic_plan',
            'line_code', v_line_code,
            'anchor_date', anchor_date,
            'previous_raw_due_date', previous_raw_due_date,
            'previous_scheduled_date', previous_scheduled_date,
            'raw_due_date', due_date,
            'scheduled_date', v_scheduled_date,
            'step_days', step_days,
            'frequency_days', v_frequency_days,
            'frequency_hours', v_frequency_hours,
            'running_hours_per_day', v_running_hours,
            'needs_shutdown_date', needs_shutdown,
            'generation_horizon_until', horizon
          )
        )
        on conflict (id) do nothing;
        inserted_count := inserted_count + 1;
      end if;

      due_date := due_date + step_days;
    end loop;
  end loop;

  return jsonb_build_object(
    'reviewed_points', reviewed_count,
    'skipped_points', skipped_count,
    'inserted_tasks', inserted_count,
    'target_start', target_start,
    'horizon', horizon
  );
end;
$$;

grant execute on function public.extend_dynamic_maintenance_plan(date, integer, uuid) to authenticated;

create or replace function public.prepare_maintenance_point_reschedule(
  target_maintenance_point_id uuid,
  new_anchor_date date,
  keep_task_id uuid default null,
  reason text default 'manual_reschedule'
)
returns integer
language plpgsql
security invoker
as $$
declare
  old_status_id uuid;
  archived_count integer := 0;
begin
  select id into old_status_id from public.task_statuses where code = 'OLD' limit 1;

  update public.maintenance_points
  set schedule_anchor_date = new_anchor_date,
      anchor_reason = reason,
      last_series_rescheduled_at = now(),
      generation_horizon_until = null,
      original_values = coalesce(original_values, '{}'::jsonb) || jsonb_build_object(
        'last_date', new_anchor_date,
        'schedule_anchor_date', new_anchor_date,
        'anchor_reason', reason
      )
  where id = target_maintenance_point_id;

  update public.planned_tasks pt
  set status_id = old_status_id,
      original_values = coalesce(pt.original_values, '{}'::jsonb) || jsonb_build_object(
        'replaced_by_series_reschedule', true,
        'series_anchor_date', new_anchor_date
      )
  where old_status_id is not null
    and pt.maintenance_point_id = target_maintenance_point_id
    and (keep_task_id is null or pt.id <> keep_task_id)
    and pt.scheduled_date > new_anchor_date
    and pt.completed_at is null
    and not exists (select 1 from public.execution_reports er where er.task_id = pt.id)
    and not exists (select 1 from public.non_execution_reports ner where ner.task_id = pt.id);

  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

grant execute on function public.prepare_maintenance_point_reschedule(uuid, date, uuid, text) to authenticated;

update public.planned_tasks pt
set original_values = coalesce(pt.original_values, '{}'::jsonb) || jsonb_build_object(
  'previous_raw_due_date',
  (coalesce(
    app_private.safe_json_date(pt.original_values->>'raw_due_date'),
    pt.original_due_date,
    pt.scheduled_date
  ) - coalesce(
    nullif(pt.original_values->>'step_days', '')::integer,
    app_private.dynamic_step_days(
      coalesce(mp.frequency_days, nullif(mp.original_values->>'frequency_days', '')::numeric),
      coalesce(mp.frequency_hours, nullif(mp.original_values->>'frequency_hours', '')::numeric),
      coalesce(mp.running_hours_per_day, nullif(mp.original_values->>'running_hours_per_day', '')::numeric)
    ),
    0
  )),
  'previous_scheduled_date',
  public.adjust_maintenance_due_date(
    (coalesce(
      app_private.safe_json_date(pt.original_values->>'raw_due_date'),
      pt.original_due_date,
      pt.scheduled_date
    ) - coalesce(
      nullif(pt.original_values->>'step_days', '')::integer,
      app_private.dynamic_step_days(
        coalesce(mp.frequency_days, nullif(mp.original_values->>'frequency_days', '')::numeric),
        coalesce(mp.frequency_hours, nullif(mp.original_values->>'frequency_hours', '')::numeric),
        coalesce(mp.running_hours_per_day, nullif(mp.original_values->>'running_hours_per_day', '')::numeric)
      ),
      0
    )),
    coalesce(pl.line_code, mp.original_values->>'line_code', pt.original_values->>'line_code'),
    pt.execution_condition
  )
)
from public.maintenance_points mp
left join public.equipment e on e.id = mp.equipment_id
left join public.production_lines pl on pl.id = e.production_line_id
where pt.maintenance_point_id = mp.id
  and pt.original_values->>'source_mode' in ('calculated_next_due', 'dynamic_plan')
  and not (pt.original_values ? 'previous_scheduled_date');

update public.maintenance_points mp
set schedule_anchor_date = coalesce(
      mp.schedule_anchor_date,
      mp.last_inspection_date,
      mp.last_change_date,
      mp.last_grease_date,
      app_private.safe_json_date(mp.original_values->>'last_date')
    ),
    needs_data_review = mp.data_quality_status <> 'COMPLETE';

do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'extend-dynamic-maintenance-plan') then
      perform cron.unschedule('extend-dynamic-maintenance-plan');
    end if;

    perform cron.schedule(
      'extend-dynamic-maintenance-plan',
      '10 23 * * *',
      $cmd$select public.extend_dynamic_maintenance_plan((timezone('Asia/Riyadh', now()))::date, 12, null);$cmd$
    );
  end if;
exception
  when others then
    raise notice 'dynamic maintenance plan cron was not scheduled: %', sqlerrm;
end $do$;
