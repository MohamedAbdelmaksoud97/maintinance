import { markWorkerNotificationReadAction } from "@/app/auth/actions";
import { AppShell, ContentCard, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

type WorkerNotification = {
  id: string;
  notification_type: string;
  scheduled_for: string;
  sent_at: string | null;
  status: string;
  payload: Record<string, unknown> | null;
  planned_tasks: {
    scheduled_date: string;
    equipment: {
      equipment_code: string | null;
      name: string | null;
      areas: { name: string | null } | null;
    } | null;
  } | null;
};

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
        <section className="grid gap-3">
          {notifications.map((notification) => (
            <NotificationCard key={notification.id} notification={notification} />
          ))}
          {!notifications.length ? (
            <ContentCard>
              <p className="text-sm font-semibold text-[#607086]">لا توجد إشعارات حتى الآن.</p>
            </ContentCard>
          ) : null}
        </section>
      )}
    </AppShell>
  );
}

function NotificationCard({ notification }: { notification: WorkerNotification }) {
  const task = notification.planned_tasks;
  const payload = notification.payload ?? {};
  const unread = notification.status === "pending";

  return (
    <ContentCard>
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={notification.status === "pending" ? "warning" : "neutral"}>{statusLabel(notification.status)}</StatusBadge>
            <StatusBadge tone="neutral">{notificationTypeLabel(notification.notification_type)}</StatusBadge>
            <StatusBadge>{formatDateTime(notification.scheduled_for)}</StatusBadge>
          </div>
          <h2 className="mt-3 break-words text-lg font-black text-[#172033]">
            {valueText(payload.message_ar) || notificationTypeLabel(notification.notification_type)}
          </h2>
          <p className="mt-1 text-sm font-semibold text-[#607086]">
            {task
              ? `${task.equipment?.equipment_code ?? "-"} - ${task.equipment?.name ?? "معدة"} · ${task.equipment?.areas?.name ?? "-"} · ${task.scheduled_date}`
              : valueText(payload.issue) || "إشعار عام"}
          </p>
        </div>
        <div className="grid gap-2 lg:min-w-[150px]">
          <StatusBadge tone={notification.notification_type === "adhoc_task" ? "danger" : "success"}>
            {notification.notification_type === "adhoc_task" ? "مهمة عارضة" : "متابعة"}
          </StatusBadge>
          {unread ? (
            <form action={markWorkerNotificationReadAction}>
              <input type="hidden" name="notification_id" value={notification.id} />
              <SubmitButton variant="secondary" className="w-full px-3 py-2 text-xs" pendingText="جاري الحفظ">
                تم الاطلاع
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>
    </ContentCard>
  );
}

function notificationTypeLabel(value: string) {
  if (value === "daily_task") return "مهمة يومية";
  if (value === "rescheduled_task") return "إعادة جدولة";
  if (value === "adhoc_task") return "مهمة عارضة";
  if (value === "account_approved") return "اعتماد الحساب";
  if (value === "area_assignment_updated") return "تحديث المناطق";
  return "إشعار جديد";
}

function statusLabel(value: string) {
  if (value === "sent") return "تم الإرسال";
  if (value === "failed") return "تعذر الإرسال";
  if (value === "cancelled") return "ملغي";
  return "جديد";
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
}
