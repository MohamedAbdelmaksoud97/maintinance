import { AppShell, ContentCard, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { AdminNotificationsRealtimeList, type AdminNotification } from "@/app/ui/live-notification-list";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from("admin_notifications")
    .select(
      "id,notification_type,status,created_at,payload,planned_tasks(id,scheduled_date,equipment(equipment_code,name,areas(name))),non_execution_reports(reason,created_at,workers(full_name))",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const notifications = (data ?? []) as unknown as AdminNotification[];
  const pendingCount = notifications.filter((notification) => notification.status === "pending").length;
  const readCount = notifications.filter((notification) => notification.status === "read").length;
  const resolvedCount = notifications.filter((notification) => notification.status === "resolved").length;

  return (
    <AppShell>
      <PageHeader
        eyebrow="إشعارات المدير"
        title="مركز الإشعارات"
        description="متابعة أسباب عدم التنفيذ والتنبيهات التي تحتاج مراجعة من المدير."
        action={<StatusBadge tone={pendingCount ? "danger" : "success"}>{pendingCount.toLocaleString("en-US")} قيد المراجعة</StatusBadge>}
      />

      {message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">
          {message}
        </p>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="قيد المراجعة" value={pendingCount} tone="danger" />
        <MetricCard label="مقروء" value={readCount} />
        <MetricCard label="تم التعامل معه" value={resolvedCount} tone="success" />
      </section>

      {error ? (
        <ContentCard>
          <p className="text-sm font-bold text-[#c1121f]">تعذر تحميل الإشعارات الآن.</p>
        </ContentCard>
      ) : (
        <AdminNotificationsRealtimeList initialNotifications={notifications} />
      )}
    </AppShell>
  );
}
