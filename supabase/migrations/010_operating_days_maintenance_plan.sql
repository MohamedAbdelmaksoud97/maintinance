create or replace function public.is_shutdown_day(
  line_code text,
  day date
)
returns boolean
language sql
stable
security invoker
as $$
  select case
    when $1 is null or $2 is null then false
    else exists (
      select 1
      from public.shutdown_windows sw
      where sw.is_active = true
        and sw.line_code = $1
        and $2 between sw.starts_on and sw.ends_on
    )
  end;
$$;

grant execute on function public.is_shutdown_day(text, date) to authenticated;

create or replace function public.add_operating_days(
  anchor_date date,
  operating_days integer,
  line_code text default null
)
returns date
language plpgsql
stable
security invoker
as $$
declare
  candidate date := anchor_date;
  counted integer := 0;
  required_days integer := greatest(0, coalesce(operating_days, 0));
begin
  if anchor_date is null or operating_days is null then
    return null;
  end if;

  if line_code is null then
    return anchor_date + required_days;
  end if;

  while counted < required_days loop
    candidate := candidate + 1;
    if not public.is_shutdown_day(line_code, candidate) then
      counted := counted + 1;
    end if;
  end loop;

  return candidate;
end;
$$;

grant execute on function public.add_operating_days(date, integer, text) to authenticated;

create or replace function public.subtract_operating_days(
  scheduled_date date,
  operating_days integer,
  line_code text default null
)
returns date
language plpgsql
stable
security invoker
as $$
declare
  candidate date := scheduled_date;
  counted integer := 0;
  required_days integer := greatest(0, coalesce(operating_days, 0));
begin
  if scheduled_date is null or operating_days is null then
    return null;
  end if;

  if line_code is null then
    return scheduled_date - required_days;
  end if;

  while counted < required_days loop
    candidate := candidate - 1;
    if not public.is_shutdown_day(line_code, candidate) then
      counted := counted + 1;
    end if;
  end loop;

  return candidate;
end;
$$;

grant execute on function public.subtract_operating_days(date, integer, text) to authenticated;

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
  uses_operating_days boolean;
  expected_task_ids uuid[] := '{}'::uuid[];
  generated_point_ids uuid[] := '{}'::uuid[];
  inserted_count integer := 0;
  reviewed_count integer := 0;
  skipped_count integer := 0;
  stale_count integer := 0;
  shifted_running_count integer := 0;
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
    and not exists (select 1 from public.execution_reports er where er.task_id = pt.id)
    and not exists (select 1 from public.non_execution_reports ner where ner.task_id = pt.id);

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
    uses_operating_days := point_row.work_type_code in ('inspection', 'greasing');

    if anchor_date is null or step_days is null then
      update public.maintenance_points
      set data_quality_status = 'MISSING_DATA',
          needs_data_review = true,
          generation_horizon_until = null
      where id = point_row.id;
      skipped_count := skipped_count + 1;
      continue;
    end if;

    update public.maintenance_points
    set data_quality_status = case
          when v_line_code is null then 'MISSING_DATA'
          else 'COMPLETE'
        end,
        needs_data_review = v_line_code is null,
        schedule_anchor_date = anchor_date,
        generation_horizon_until = horizon,
        original_values = coalesce(original_values, '{}'::jsonb) || jsonb_build_object(
          'line_code', v_line_code,
          'step_days', step_days,
          'last_date', anchor_date,
          'frequency_days', v_frequency_days,
          'frequency_hours', v_frequency_hours,
          'running_hours_per_day', v_running_hours,
          'uses_operating_days', uses_operating_days,
          'generation_horizon_until', horizon
        )
    where id = point_row.id;

    generated_point_ids := array_append(generated_point_ids, point_row.id);

    select id
    into plan_item_id
    from public.annual_plan_items
    where maintenance_point_id = point_row.id
    order by created_at desc
    limit 1;

    due_date := case
      when uses_operating_days then public.add_operating_days(anchor_date, step_days, v_line_code)
      else anchor_date + step_days
    end;

    while due_date < target_start loop
      due_date := case
        when uses_operating_days then public.add_operating_days(due_date, step_days, v_line_code)
        else due_date + step_days
      end;
    end loop;

    while due_date <= horizon loop
      previous_raw_due_date := case
        when uses_operating_days then public.subtract_operating_days(due_date, step_days, v_line_code)
        else due_date - step_days
      end;
      previous_scheduled_date := case
        when uses_operating_days then previous_raw_due_date
        else public.adjust_maintenance_due_date(previous_raw_due_date, v_line_code, point_row.execution_condition)
      end;
      v_scheduled_date := case
        when uses_operating_days then due_date
        else public.adjust_maintenance_due_date(due_date, v_line_code, point_row.execution_condition)
      end;
      needs_shutdown := point_row.execution_condition = 'shutdown'
        and not exists (
          select 1
          from public.shutdown_windows sw
          where sw.is_active = true
            and sw.line_code = v_line_code
            and v_scheduled_date between sw.starts_on and sw.ends_on
        );

      select pt.id
      into task_id
      from public.planned_tasks pt
      left join public.task_statuses ts on ts.id = pt.status_id
      where pt.maintenance_point_id = point_row.id
        and pt.scheduled_date = v_scheduled_date
        and coalesce(ts.code, '') <> 'OLD'
      order by pt.created_at desc
      limit 1;

      task_id := coalesce(task_id, app_private.stable_uuid('dynamic-task:' || point_row.id::text || ':' || v_scheduled_date::text));
      expected_task_ids := array_append(expected_task_ids, task_id);

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
          'uses_operating_days', uses_operating_days,
          'calendar_due_without_shutdown_discount', case when uses_operating_days then previous_raw_due_date + step_days else null end,
          'needs_shutdown_date', needs_shutdown,
          'generation_horizon_until', horizon
        )
      )
      on conflict (id) do update set
        annual_plan_item_id = excluded.annual_plan_item_id,
        equipment_id = excluded.equipment_id,
        maintenance_point_id = excluded.maintenance_point_id,
        work_type_id = excluded.work_type_id,
        material_id = excluded.material_id,
        status_id = excluded.status_id,
        assignment_status_id = coalesce(planned_tasks.assignment_status_id, excluded.assignment_status_id),
        original_due_date = excluded.original_due_date,
        scheduled_date = excluded.scheduled_date,
        execution_condition = excluded.execution_condition,
        planned_quantity = excluded.planned_quantity,
        planned_quantity_unit = excluded.planned_quantity_unit,
        original_values = excluded.original_values,
        updated_at = now()
      where planned_tasks.completed_at is null
        and not exists (select 1 from public.execution_reports er where er.task_id = planned_tasks.id)
        and not exists (select 1 from public.non_execution_reports ner where ner.task_id = planned_tasks.id);

      inserted_count := inserted_count + 1;
      if uses_operating_days and v_line_code is not null and due_date <> previous_raw_due_date + step_days then
        shifted_running_count := shifted_running_count + 1;
      end if;

      due_date := case
        when uses_operating_days then public.add_operating_days(due_date, step_days, v_line_code)
        else due_date + step_days
      end;
    end loop;
  end loop;

  update public.planned_tasks pt
  set status_id = old_status_id,
      original_values = coalesce(pt.original_values, '{}'::jsonb) || jsonb_build_object(
        'replaced_by_operating_days_plan', true,
        'generation_horizon_until', horizon
      ),
      updated_at = now()
  where old_status_id is not null
    and pt.maintenance_point_id = any(generated_point_ids)
    and not (pt.id = any(expected_task_ids))
    and pt.scheduled_date between target_start and horizon
    and pt.completed_at is null
    and pt.original_values->>'source_mode' in ('calculated_next_due', 'dynamic_plan')
    and not exists (select 1 from public.execution_reports er where er.task_id = pt.id)
    and not exists (select 1 from public.non_execution_reports ner where ner.task_id = pt.id);

  get diagnostics stale_count = row_count;

  return jsonb_build_object(
    'reviewed_points', reviewed_count,
    'skipped_points', skipped_count,
    'inserted_tasks', inserted_count,
    'stale_tasks_archived', stale_count,
    'running_tasks_shifted_by_shutdown_discount', shifted_running_count,
    'target_start', target_start,
    'horizon', horizon
  );
end;
$$;

grant execute on function public.extend_dynamic_maintenance_plan(date, integer, uuid) to authenticated;

update public.planned_tasks pt
set original_values = coalesce(pt.original_values, '{}'::jsonb) || jsonb_build_object(
  'previous_raw_due_date',
  case
    when wt.code in ('inspection', 'greasing') then public.subtract_operating_days(
      coalesce(app_private.safe_json_date(pt.original_values->>'raw_due_date'), pt.original_due_date, pt.scheduled_date),
      coalesce(
        nullif(pt.original_values->>'step_days', '')::integer,
        app_private.dynamic_step_days(
          coalesce(mp.frequency_days, nullif(mp.original_values->>'frequency_days', '')::numeric),
          coalesce(mp.frequency_hours, nullif(mp.original_values->>'frequency_hours', '')::numeric),
          coalesce(mp.running_hours_per_day, nullif(mp.original_values->>'running_hours_per_day', '')::numeric)
        ),
        0
      ),
      coalesce(pl.line_code, mp.original_values->>'line_code', pt.original_values->>'line_code')
    )
    else (
      coalesce(app_private.safe_json_date(pt.original_values->>'raw_due_date'), pt.original_due_date, pt.scheduled_date)
      - coalesce(
        nullif(pt.original_values->>'step_days', '')::integer,
        app_private.dynamic_step_days(
          coalesce(mp.frequency_days, nullif(mp.original_values->>'frequency_days', '')::numeric),
          coalesce(mp.frequency_hours, nullif(mp.original_values->>'frequency_hours', '')::numeric),
          coalesce(mp.running_hours_per_day, nullif(mp.original_values->>'running_hours_per_day', '')::numeric)
        ),
        0
      )
    )
  end,
  'previous_scheduled_date',
  case
    when wt.code in ('inspection', 'greasing') then public.subtract_operating_days(
      coalesce(app_private.safe_json_date(pt.original_values->>'raw_due_date'), pt.original_due_date, pt.scheduled_date),
      coalesce(
        nullif(pt.original_values->>'step_days', '')::integer,
        app_private.dynamic_step_days(
          coalesce(mp.frequency_days, nullif(mp.original_values->>'frequency_days', '')::numeric),
          coalesce(mp.frequency_hours, nullif(mp.original_values->>'frequency_hours', '')::numeric),
          coalesce(mp.running_hours_per_day, nullif(mp.original_values->>'running_hours_per_day', '')::numeric)
        ),
        0
      ),
      coalesce(pl.line_code, mp.original_values->>'line_code', pt.original_values->>'line_code')
    )
    else public.adjust_maintenance_due_date(
      (
        coalesce(app_private.safe_json_date(pt.original_values->>'raw_due_date'), pt.original_due_date, pt.scheduled_date)
        - coalesce(
          nullif(pt.original_values->>'step_days', '')::integer,
          app_private.dynamic_step_days(
            coalesce(mp.frequency_days, nullif(mp.original_values->>'frequency_days', '')::numeric),
            coalesce(mp.frequency_hours, nullif(mp.original_values->>'frequency_hours', '')::numeric),
            coalesce(mp.running_hours_per_day, nullif(mp.original_values->>'running_hours_per_day', '')::numeric)
          ),
          0
        )
      ),
      coalesce(pl.line_code, mp.original_values->>'line_code', pt.original_values->>'line_code'),
      pt.execution_condition
    )
  end,
  'uses_operating_days',
  wt.code in ('inspection', 'greasing')
)
from public.maintenance_points mp
left join public.equipment e on e.id = mp.equipment_id
left join public.production_lines pl on pl.id = e.production_line_id
left join public.maintenance_work_types wt on wt.id = mp.work_type_id
where pt.maintenance_point_id = mp.id
  and pt.original_values->>'source_mode' in ('calculated_next_due', 'dynamic_plan')
  and pt.completed_at is null
  and not exists (select 1 from public.execution_reports er where er.task_id = pt.id)
  and not exists (select 1 from public.non_execution_reports ner where ner.task_id = pt.id);
