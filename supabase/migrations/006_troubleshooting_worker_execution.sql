alter table troubleshooting_reports
  add column if not exists scheduled_date date;

create index if not exists troubleshooting_reports_scheduled_date_idx
on troubleshooting_reports(scheduled_date);

drop policy if exists "troubleshooting worker update assigned" on troubleshooting_reports;
create policy "troubleshooting worker update assigned"
on troubleshooting_reports
for update
to authenticated
using (
  exists (
    select 1
    from troubleshooting_assignees
    where troubleshooting_assignees.report_id = troubleshooting_reports.id
      and troubleshooting_assignees.worker_id = app_private.current_worker_id()
  )
  and approval_status = 'pending'
)
with check (
  exists (
    select 1
    from troubleshooting_assignees
    where troubleshooting_assignees.report_id = troubleshooting_reports.id
      and troubleshooting_assignees.worker_id = app_private.current_worker_id()
  )
  and approval_status = 'pending'
);
