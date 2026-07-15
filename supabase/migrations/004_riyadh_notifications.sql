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
      'Asia/Riyadh'
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

