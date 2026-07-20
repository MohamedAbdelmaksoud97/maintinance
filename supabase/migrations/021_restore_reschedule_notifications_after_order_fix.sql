update public.notification_queue
set status = 'pending'
where notification_type = 'rescheduled_task'
  and status = 'cancelled';
