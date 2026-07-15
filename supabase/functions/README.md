# Supabase Edge Functions

## daily-notifications

Calls `enqueue_daily_worker_notifications(current_date)` to create daily worker notification rows for assigned tasks.

Schedule it for 9:00 AM Asia/Riyadh. If the scheduler uses UTC, use `06:00 UTC`.

Required secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The service role key must stay only in Supabase function secrets. Do not expose it in Next.js public env vars.
