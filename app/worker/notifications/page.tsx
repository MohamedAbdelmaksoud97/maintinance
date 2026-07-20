import { AppShell, ContentCard, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { WorkerNotificationsRealtimeList, type WorkerNotification } from "@/app/ui/live-notification-list";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export default async function WorkerNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from("notification_queue")
    .select("id,notification_type,scheduled_for,sent_at,status,payload,planned_tasks(scheduled_date,equipment(equipment_code,name,areas(name)))")
    .order("scheduled_for", { ascending: false })
    .limit(100);

  const notifications = (data ?? []) as unknown as WorkerNotification[];
  const pendingCount = notifications.filter((notification) => notification.status === "pending").length;
  const taskCount = notifications.filter((notification) => ["daily_task", "rescheduled_task", "adhoc_task"].includes(notification.notification_type)).length;
  const adminCount = notifications.filter((notification) => ["account_approved", "area_assignment_updated"].includes(notification.notification_type)).length;

  return (
    <AppShell navigationScope="worker">
      <PageHeader
        eyebrow="إشعارات العامل"
        title="كل جديد عن مهامك"
        description="متابعة اعتماد الحساب، تحديث المناطق، مهام اليوم، إعادة الجدولة، والمهام العارضة المسندة إليك."
        action={<StatusBadge tone={pendingCount ? "warning" : "success"}>{pendingCount.toLocaleString("ar-EG")} جديد</StatusBadge>}
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="إجمالي الإشعارات" value={notifications.length} />
        <MetricCard label="إشعارات المهام" value={taskCount} tone="warning" />
        <MetricCard label="إشعارات الإدارة" value={adminCount} tone="success" />
      </section>

      {message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">
          {message}
        </p>
      ) : null}

      {error ? (
        <ContentCard>
          <p className="text-sm font-bold text-[#c1121f]">تعذر تحميل الإشعارات الآن.</p>
        </ContentCard>
      ) : (
        <WorkerNotificationsRealtimeList initialNotifications={notifications} />
      )}
    </AppShell>
  );
}
