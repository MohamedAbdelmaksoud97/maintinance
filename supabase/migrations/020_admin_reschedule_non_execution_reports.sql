drop policy if exists "non execution admin update" on public.non_execution_reports;

create policy "non execution admin update"
on public.non_execution_reports
for update
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

update public.non_execution_reports ner
set approval_status = 'approved',
    updated_at = now()
from public.planned_tasks pt
where pt.id = ner.task_id
  and ner.approval_status = 'pending'
  and (
    coalesce(pt.original_values, '{}'::jsonb) ? 'rescheduled_after_non_execution'
    or pt.scheduled_date > ner.created_at::date
  );

notify pgrst, 'reload schema';
