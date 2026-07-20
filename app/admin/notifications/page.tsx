import { markAdminNotificationReadAction, reschedulePlannedTaskGroupAction } from "@/app/auth/actions";
import { AppShell, ContentCard, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

type AdminNotification = {
  id: string;
  notification_type: string;
  status: string;
  created_at: string;
  payload: Record<string, unknown> | null;
  planned_tasks: {
    id: string;
    scheduled_date: string;
    equipment: {
      equipment_code: string | null;
      name: string | null;
      areas: { name: string | null } | null;
    } | null;
  } | null;
  non_execution_reports: {
    reason: string;
    created_at: string;
    workers: { full_name: string | null } | null;
  } | null;
};

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
        <section className="grid gap-3">
          {notifications.map((notification) => (
            <NotificationCard key={notification.id} notification={notification} />
          ))}
          {!notifications.length ? (
            <ContentCard>
              <p className="text-sm font-semibold text-[#607086]">لايوجد إشعارات حاليا.</p>
            </ContentCard>
          ) : null}
        </section>
      )}
    </AppShell>
  );
}

function NotificationCard({ notification }: { notification: AdminNotification }) {
  const task = notification.planned_tasks;
  const report = notification.non_execution_reports;
  const isPending = notification.status === "pending";
  const payload = notification.payload ?? {};
  const isReschedulable = isPending && notification.notification_type === "non_execution_reason" && Boolean(task?.id);

  return (
    <ContentCard>
      <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={statusTone(notification.status)}>{statusLabel(notification.status)}</StatusBadge>
            <StatusBadge tone="neutral">{notificationTypeLabel(notification.notification_type)}</StatusBadge>
            <StatusBadge>{formatDateTime(notification.created_at)}</StatusBadge>
          </div>
          <h2 className="mt-3 text-lg font-black">
            {task?.equipment?.equipment_code ?? valueText(payload.equipment_code) ?? "لايوجد"} - {task?.equipment?.name ?? valueText(payload.equipment_name) ?? valueText(payload.issue) ?? "لايوجد"}
          </h2>
          <p className="mt-1 text-sm font-semibold text-[#607086]">
            المنطقة: {task?.equipment?.areas?.name ?? valueText(payload.area_name) ?? "لايوجد"} · تاريخ المهمة: {task?.scheduled_date ?? "لايوجد"}
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Info label="العامل" value={report?.workers?.full_name ?? valueText(payload.worker_name) ?? "لايوجد"} />
            <Info label="وقت التسجيل" value={formatDateTime(report?.created_at ?? notification.created_at)} />
          </div>
          <div className="mt-3 rounded-lg border border-[#e2e8ef] bg-[#f8fafc] p-3">
            <p className="text-xs font-black text-[#607086]">الرسالة / السبب</p>
            <p className="mt-1 text-sm font-bold text-[#172033]">
              {report?.reason ?? valueText(payload.result) ?? valueText(payload.task_details) ?? valueText(payload.message_ar) ?? "لايوجد"}
            </p>
            {valueText(payload.notes) ? <p className="mt-2 text-xs font-bold text-[#607086]">ملاحظات عامة: {valueText(payload.notes)}</p> : null}
            {typeof payload.photo_count === "number" ? <p className="mt-2 text-xs font-bold text-[#607086]">عدد الصور: {payload.photo_count.toLocaleString("ar-EG")}</p> : null}
          </div>
        </div>

        <div className="grid gap-2 xl:min-w-[360px]">
          {isReschedulable && task?.id ? (
            <form action={reschedulePlannedTaskGroupAction} className="grid gap-2 rounded-lg border border-[#dbe3ea] bg-[#fbfcfd] p-3">
              <input type="hidden" name="task_ids" value={task.id} />
              <input type="hidden" name="return_date" value={task.scheduled_date} />
              <input name="new_date" type="date" required className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-bold outline-none" />
              <input name="reason" placeholder="ملاحظة إعادة الجدولة" className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-bold outline-none" />
              <SubmitButton pendingText="جاري الحفظ">تحديد موعد جديد</SubmitButton>
            </form>
          ) : null}

          {notification.status === "pending" ? (
            <form action={markAdminNotificationReadAction}>
              <input type="hidden" name="notification_id" value={notification.id} />
              <SubmitButton variant="secondary" className="w-full" pendingText="جاري الحفظ">تعليم كمقروء</SubmitButton>
            </form>
          ) : null}
        </div>
      </div>
    </ContentCard>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e2e8ef] bg-white p-3">
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-[#172033]">{value}</p>
    </div>
  );
}

function statusLabel(value: string) {
  if (value === "read") return "مقروء";
  if (value === "resolved") return "تم التعامل معه";
  if (value === "cancelled") return "ملغي";
  return "قيد المراجعة";
}

function statusTone(value: string) {
  if (value === "pending") return "danger";
  if (value === "resolved") return "success";
  return "neutral";
}

function notificationTypeLabel(value: string) {
  if (value === "non_execution_reason") return "سبب عدم تنفيذ";
  if (value === "worker_completion") return "تنفيذ مهمة";
  if (value === "adhoc_execution_update") return "تقرير مهمة عارضة";
  return "إشعار";
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
