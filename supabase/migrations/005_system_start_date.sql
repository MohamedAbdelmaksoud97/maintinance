insert into task_statuses (code, name, is_terminal, sort_order)
values ('OLD', 'قديم', true, 900)
on conflict (code) do update
set name = excluded.name,
    is_terminal = excluded.is_terminal,
    sort_order = excluded.sort_order;

update planned_tasks
set status_id = (
  select id
  from task_statuses
  where code = 'OLD'
),
updated_at = now()
where scheduled_date < date '2026-07-15';

