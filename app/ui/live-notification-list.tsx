"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, Clock3, ExternalLink, ImageIcon } from "lucide-react";
import { reschedulePlannedTaskGroupAction } from "@/app/auth/actions";
import { SubmitButton } from "@/app/ui/submit-button";
import { createClient } from "@/utils/supabase/client";

export type WorkerNotification = {
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

export type AdminNotification = {
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

const workerSelect =
  "id,notification_type,scheduled_for,sent_at,status,payload,planned_tasks(scheduled_date,equipment(equipment_code,name,areas(name)))";
const adminSelect =
  "id,notification_type,status,created_at,payload,planned_tasks(id,scheduled_date,equipment(equipment_code,name,areas(name))),non_execution_reports(reason,created_at,workers(full_name))";

export function WorkerNotificationsRealtimeList({ initialNotifications }: { initialNotifications: WorkerNotification[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function refresh() {
      const { data } = await supabase
        .from("notification_queue")
        .select(workerSelect)
        .order("scheduled_for", { ascending: false })
        .limit(100);

      if (!disposed) setNotifications(((data ?? []) as unknown as WorkerNotification[]));
    }

    let channel = supabase.channel("worker-notifications-page");
    supabase
      .from("workers")
      .select("id")
      .maybeSingle()
      .then(({ data }) => {
        if (disposed || !data?.id) return;
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "notification_queue", filter: `worker_id=eq.${data.id}` },
            () => refresh(),
          )
          .subscribe();
      });

    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function markRead(notificationId: string) {
    setLoadingId(notificationId);
    setNotifications((current) =>
      current.map((item) => (item.id === notificationId ? { ...item, status: "sent", sent_at: new Date().toISOString() } : item)),
    );
    const { error } = await supabase.rpc("mark_worker_notification_read", {
      target_notification_id: notificationId,
    });
    if (error) {
      setNotifications(initialNotifications);
    }
    setLoadingId(null);
  }

  return (
    <section className="grid gap-3">
      {notifications.map((notification) => (
        <WorkerNotificationCard
          key={notification.id}
          notification={notification}
          loading={loadingId === notification.id}
          onMarkRead={() => markRead(notification.id)}
        />
      ))}
      {!notifications.length ? <EmptyState text="لا توجد إشعارات حتى الآن." /> : null}
    </section>
  );
}

export function AdminNotificationsRealtimeList({ initialNotifications }: { initialNotifications: AdminNotification[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function refresh() {
      const { data } = await supabase
        .from("admin_notifications")
        .select(adminSelect)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!disposed) setNotifications(((data ?? []) as unknown as AdminNotification[]));
    }

    const channel = supabase
      .channel("admin-notifications-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_notifications" },
        () => refresh(),
      )
      .subscribe();

    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function markRead(notificationId: string) {
    setLoadingId(notificationId);
    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId ? { ...item, status: "read", read_at: new Date().toISOString() } as AdminNotification : item,
      ),
    );
    const { error } = await supabase
      .from("admin_notifications")
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("id", notificationId);
    if (error) {
      setNotifications(initialNotifications);
    }
    setLoadingId(null);
  }

  return (
    <section className="grid gap-3">
      {notifications.map((notification) => (
        <AdminNotificationCard
          key={notification.id}
          notification={notification}
          loading={loadingId === notification.id}
          onMarkRead={() => markRead(notification.id)}
        />
      ))}
      {!notifications.length ? <EmptyState text="لايوجد إشعارات حاليا." /> : null}
    </section>
  );
}

function WorkerNotificationCard({
  notification,
  loading,
  onMarkRead,
}: {
  notification: WorkerNotification;
  loading: boolean;
  onMarkRead: () => void;
}) {
  const task = notification.planned_tasks;
  const payload = notification.payload ?? {};
  const unread = notification.status === "pending";

  return (
    <article className={cardClass(unread)}>
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <BadgeRow>
            <StatusBadge tone={unread ? "warning" : "neutral"}>{workerStatusLabel(notification.status)}</StatusBadge>
            <StatusBadge tone="neutral">{workerTypeLabel(notification.notification_type)}</StatusBadge>
            <StatusBadge>{formatDateTime(notification.scheduled_for)}</StatusBadge>
          </BadgeRow>
          <h2 className="mt-3 break-words text-lg font-black text-[#172033]">
            {valueText(payload.message_ar) || workerTypeLabel(notification.notification_type)}
          </h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-[#607086]">
            {task
              ? `${task.equipment?.equipment_code ?? "-"} - ${task.equipment?.name ?? "معدة"} · ${task.equipment?.areas?.name ?? "-"} · ${task.scheduled_date}`
              : valueText(payload.issue) || "إشعار عام"}
          </p>
        </div>
        <div className="grid gap-2 lg:min-w-[160px]">
          <StatusBadge tone={notification.notification_type === "adhoc_task" ? "danger" : "success"}>
            {notification.notification_type === "adhoc_task" ? "مهمة عارضة" : "متابعة"}
          </StatusBadge>
          {unread ? <AsyncButton loading={loading} onClick={onMarkRead} label="تم الاطلاع" /> : null}
        </div>
      </div>
    </article>
  );
}

function AdminNotificationCard({
  notification,
  loading,
  onMarkRead,
}: {
  notification: AdminNotification;
  loading: boolean;
  onMarkRead: () => void;
}) {
  const task = notification.planned_tasks;
  const report = notification.non_execution_reports;
  const isPending = notification.status === "pending";
  const payload = notification.payload ?? {};
  const isReschedulable = isPending && notification.notification_type === "non_execution_reason" && Boolean(task?.id);

  return (
    <article className={cardClass(isPending, notification.notification_type === "adhoc_execution_update")}>
      <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
        <div className="min-w-0">
          <BadgeRow>
            <StatusBadge tone={adminStatusTone(notification.status)}>{adminStatusLabel(notification.status)}</StatusBadge>
            <StatusBadge tone="neutral">{adminTypeLabel(notification.notification_type)}</StatusBadge>
            <StatusBadge>{formatDateTime(notification.created_at)}</StatusBadge>
          </BadgeRow>
          <h2 className="mt-3 break-words text-lg font-black">
            {task?.equipment?.equipment_code ?? valueText(payload.equipment_code) ?? "لايوجد"} -{" "}
            {task?.equipment?.name ?? valueText(payload.equipment_name) ?? valueText(payload.issue) ?? "لايوجد"}
          </h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-[#607086]">
            المنطقة: {task?.equipment?.areas?.name ?? valueText(payload.area_name) ?? "لايوجد"} · تاريخ المهمة:{" "}
            {task?.scheduled_date ?? valueText(payload.scheduled_date) ?? "لايوجد"}
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Info label="العامل" value={report?.workers?.full_name ?? valueText(payload.worker_name) ?? "لايوجد"} />
            <Info label="وقت التسجيل" value={formatDateTime(report?.created_at ?? notification.created_at)} />
          </div>
          <div className="mt-3 rounded-lg border border-[#e2e8ef] bg-[#f8fafc] p-3">
            <p className="text-xs font-black text-[#607086]">الرسالة / السبب</p>
            <p className="mt-1 text-sm font-bold leading-6 text-[#172033]">
              {report?.reason ?? valueText(payload.result) ?? valueText(payload.task_details) ?? valueText(payload.message_ar) ?? "لايوجد"}
            </p>
            {valueText(payload.notes) ? <p className="mt-2 text-xs font-bold text-[#607086]">ملاحظات عامة: {valueText(payload.notes)}</p> : null}
            {typeof payload.photo_count === "number" ? <p className="mt-2 text-xs font-bold text-[#607086]">عدد الصور: {payload.photo_count.toLocaleString("ar-EG")}</p> : null}
          </div>
          <ExecutionPhotoStrip notification={notification} />
        </div>

        <div className="grid gap-2 xl:min-w-[360px]">
          {isReschedulable && task?.id ? (
            <form action={reschedulePlannedTaskGroupAction} className="grid gap-2 rounded-lg border border-[#dbe3ea] bg-[#fbfcfd] p-3">
              <input type="hidden" name="task_ids" value={task.id} />
              <input type="hidden" name="return_date" value={task.scheduled_date} />
              <input name="new_date" type="date" required className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-bold outline-none transition focus:border-[#0b559f]" />
              <input name="reason" placeholder="ملاحظة إعادة الجدولة" className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-bold outline-none transition focus:border-[#0b559f]" />
              <SubmitButton pendingText="جاري الحفظ">تحديد موعد جديد</SubmitButton>
            </form>
          ) : null}

          {isPending ? <AsyncButton loading={loading} onClick={onMarkRead} label="تعليم كمقروء" /> : null}
        </div>
      </div>
    </article>
  );
}

function ExecutionPhotoStrip({ notification }: { notification: AdminNotification }) {
  const supabase = useMemo(() => createClient(), []);
  const [photos, setPhotos] = useState<{ path: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const payload = notification.payload ?? {};
  const reportId = valueText(payload.report_id);
  const taskId = notification.planned_tasks?.id ?? null;

  useEffect(() => {
    let disposed = false;

    async function loadPhotos() {
      const paths = await loadExecutionPhotoPaths();
      if (!paths.length || disposed) {
        if (!disposed) setPhotos([]);
        return;
      }

      setLoading(true);
      const { data } = await supabase.storage.from("maintenance-photos").createSignedUrls(paths, 60 * 30);
      if (!disposed) {
        setPhotos(
          (data ?? []).flatMap((item) => {
            if (!item.path || !item.signedUrl) return [];
            return [{ path: item.path, url: item.signedUrl }];
          }),
        );
        setLoading(false);
      }
    }

    async function loadExecutionPhotoPaths() {
      if (notification.notification_type === "worker_completion" && taskId) {
        const { data } = await supabase
          .from("execution_reports")
          .select("photo_paths")
          .eq("task_id", taskId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return ((data?.photo_paths ?? []) as string[]).filter(Boolean);
      }

      if (notification.notification_type === "adhoc_execution_update") {
        if (!reportId) return [];
        const { data } = await supabase
          .from("troubleshooting_reports")
          .select("photo_paths")
          .eq("id", reportId)
          .maybeSingle();
        return ((data?.photo_paths ?? []) as string[]).filter(Boolean);
      }

      return [];
    }

    loadPhotos();
    return () => {
      disposed = true;
    };
  }, [notification.notification_type, reportId, supabase, taskId]);

  if (loading) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-[#cbd7e3] bg-white p-3 text-xs font-bold text-[#607086]">
        جاري تحميل صور التنفيذ...
      </div>
    );
  }

  if (!photos.length) return null;

  return (
    <div className="mt-3 rounded-lg border border-[#dbe3ea] bg-white p-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-black text-[#324155]">
        <ImageIcon size={16} />
        صور التنفيذ
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, index) => (
          <a
            key={photo.path}
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            className="group relative block overflow-hidden rounded-lg border border-[#dbe3ea] bg-[#f8fafc] shadow-sm transition hover:-translate-y-0.5 hover:border-[#0b559f] hover:shadow-md"
            aria-label={`فتح صورة التنفيذ ${index + 1}`}
          >
            <span
              aria-hidden="true"
              className="block aspect-square w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${photo.url})` }}
            />
            <span className="sr-only">صورة تنفيذ {index + 1}</span>
            <span className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-white/90 text-[#0b559f] opacity-0 shadow-sm transition group-hover:opacity-100">
              <ExternalLink size={15} />
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function AsyncButton({ loading, onClick, label }: { loading: boolean; onClick: () => void; label: string }) {
  const [pending, startTransition] = useTransition();
  const busy = loading || pending;
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy}
      onClick={() => startTransition(onClick)}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#cbd7e3] bg-white px-4 py-3 text-sm font-black text-[#324155] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#0b559f] hover:text-[#0b559f] hover:shadow-md active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-wait disabled:opacity-75"
    >
      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <CheckCircle2 size={17} />}
      {busy ? "جاري الحفظ" : label}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <article className="rounded-lg border border-dashed border-[#cbd7e3] bg-white p-6 text-center shadow-sm">
      <Clock3 className="mx-auto h-8 w-8 text-[#607086]" />
      <p className="mt-3 text-sm font-semibold text-[#607086]">{text}</p>
    </article>
  );
}

function BadgeRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e2e8ef] bg-white p-3">
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-[#172033]">{value}</p>
    </div>
  );
}

function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const colors = {
    neutral: "bg-[#eef6ff] text-[#0b559f]",
    success: "bg-[#eef9f2] text-[#207a45]",
    warning: "bg-[#fff7e8] text-[#a16207]",
    danger: "bg-[#fff0f1] text-[#c1121f]",
  };

  return <span className={`rounded-md px-2.5 py-1 text-xs font-black ${colors[tone]}`}>{children}</span>;
}

function cardClass(unread: boolean, accent = false) {
  if (unread) return "rounded-lg border border-[#bdd6ee] bg-white p-5 shadow-sm ring-2 ring-[#eef6ff] transition hover:-translate-y-0.5 hover:shadow-md";
  if (accent) return "rounded-lg border border-[#f1c7c7] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md";
  return "rounded-lg border border-[#dbe3ea] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md";
}

function workerTypeLabel(value: string) {
  if (value === "daily_task") return "مهمة يومية";
  if (value === "rescheduled_task") return "إعادة جدولة";
  if (value === "adhoc_task") return "مهمة عارضة";
  if (value === "account_approved") return "اعتماد الحساب";
  if (value === "area_assignment_updated") return "تحديث المناطق";
  return "إشعار جديد";
}

function workerStatusLabel(value: string) {
  if (value === "sent") return "تم الاطلاع";
  if (value === "failed") return "تعذر الإرسال";
  if (value === "cancelled") return "ملغي";
  return "جديد";
}

function adminTypeLabel(value: string) {
  if (value === "non_execution_reason") return "سبب عدم تنفيذ";
  if (value === "worker_completion") return "تنفيذ مهمة";
  if (value === "adhoc_execution_update") return "تقرير مهمة عارضة";
  return "إشعار";
}

function adminStatusLabel(value: string) {
  if (value === "read") return "مقروء";
  if (value === "resolved") return "تم التعامل معه";
  if (value === "cancelled") return "ملغي";
  return "قيد المراجعة";
}

function adminStatusTone(value: string) {
  if (value === "pending") return "danger";
  if (value === "resolved") return "success";
  return "neutral";
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
