"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { Bell } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type NotificationScope = "admin" | "worker";

type ToastState = {
  id: number;
  title: string;
  body: string;
};

type NotificationRow = {
  id?: string;
  status?: string;
  notification_type?: string;
  payload?: Record<string, unknown> | null;
};

export function NotificationRealtimeBadge({
  scope,
  active = false,
}: {
  scope: NotificationScope;
  active?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [count, setCount] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const initialLoadDone = useRef(false);
  const toastId = useRef(0);

  useEffect(() => {
    let disposed = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function refreshCount() {
      const table = scope === "admin" ? "admin_notifications" : "notification_queue";
      const { count: nextCount } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (!disposed) {
        setCount(nextCount ?? 0);
        initialLoadDone.current = true;
      }
    }

    async function getWorkerFilter() {
      if (scope === "admin") return undefined;
      const { data } = await supabase.from("workers").select("id").maybeSingle();
      return data?.id ? `worker_id=eq.${data.id}` : undefined;
    }

    function showToast(row: NotificationRow) {
      if (!initialLoadDone.current || row.status !== "pending") return;
      const payload = row.payload ?? {};
      toastId.current += 1;
      setToast({
        id: toastId.current,
        title: scope === "admin" ? "إشعار جديد للمدير" : "إشعار جديد",
        body: valueText(payload.message_ar) ?? notificationTypeLabel(row.notification_type),
      });
    }

    refreshCount();

    let channel = supabase.channel(`${scope}-notifications-sidebar`);
    getWorkerFilter().then((filter) => {
      if (disposed) return;
      channel = channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: scope === "admin" ? "admin_notifications" : "notification_queue",
            filter,
          },
          (payload: RealtimePostgresChangesPayload<NotificationRow>) => {
            refreshCount();
            if (payload.eventType === "INSERT") {
              showToast(payload.new);
            }
          },
        )
        .subscribe();
    });

    intervalId = setInterval(refreshCount, 60000);

    return () => {
      disposed = true;
      if (intervalId) clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [scope, supabase]);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timeoutId);
  }, [toast]);

  return (
    <>
      <span
        className={
          count > 0
            ? "mr-auto inline-flex min-w-6 items-center justify-center rounded-full bg-[#c1121f] px-1.5 py-0.5 text-[11px] font-black leading-5 text-white shadow-sm"
            : active
              ? "mr-auto h-2.5 w-2.5 rounded-full bg-[#207a45]"
              : "mr-auto h-2.5 w-2.5 rounded-full bg-[#cbd7e3]"
        }
        aria-label={count > 0 ? `${count} إشعار جديد` : "لا توجد إشعارات جديدة"}
      >
        {count > 0 ? count.toLocaleString("ar-EG") : null}
      </span>

      {toast ? (
        <div
          key={toast.id}
          role="status"
          className="fixed bottom-5 left-5 z-[70] w-[min(360px,calc(100vw-40px))] rounded-lg border border-[#bdd6ee] bg-white p-4 text-right shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eef6ff] text-[#0b559f]">
              <Bell size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-[#172033]">{toast.title}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-[#607086]">{toast.body}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function notificationTypeLabel(value?: string) {
  if (value === "daily_task") return "لديك مهمة صيانة اليوم";
  if (value === "rescheduled_task") return "تمت إعادة جدولة مهمة";
  if (value === "adhoc_task") return "تم إسناد مهمة عارضة";
  if (value === "account_approved") return "تم اعتماد الحساب";
  if (value === "area_assignment_updated") return "تم تحديث مناطق العمل";
  if (value === "non_execution_reason") return "عامل سجل سبب عدم تنفيذ";
  if (value === "worker_completion") return "عامل أكمل مهمة";
  if (value === "adhoc_execution_update") return "تحديث تنفيذ مهمة عارضة";
  return "إشعار جديد";
}
