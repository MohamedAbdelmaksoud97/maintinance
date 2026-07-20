import { updateAdhocExecutionAction } from "@/app/auth/actions";
import { AppShell, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import { getSaudiToday } from "@/utils/operational-time";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

type AdhocReport = {
  id: string;
  issue: string;
  priority: string;
  status: string;
  scheduled_date: string | null;
  started_at: string | null;
  ended_at: string | null;
  result: string | null;
  photo_paths: string[];
  updated_at: string;
  equipment_code: string | null;
  equipment_name: string | null;
  area_name: string | null;
};

export default async function WorkerAdhocTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const supabase = createClient(await cookies());
  const today = getSaudiToday();
  const { data, error } = await supabase.rpc("get_my_open_adhoc_tasks");
  const reports = (data ?? []) as unknown as AdhocReport[];
  const todayCount = reports.filter((report) => report.scheduled_date === today).length;
  const urgentCount = reports.filter((report) => report.priority === "urgent" || report.priority === "high").length;
  const inProgressCount = reports.filter((report) => report.status === "in_progress").length;

  return (
    <AppShell navigationScope="worker">
      <PageHeader
        eyebrow="واجهة العامل"
        title="المهام العارضة"
        description="كل المهام العارضة المفتوحة المسندة إليك، مع تثبيت مهام اليوم والأولوية العالية بالأعلى."
        action={<StatusBadge tone={todayCount ? "warning" : "neutral"}>{todayCount.toLocaleString("ar-EG")} اليوم</StatusBadge>}
      />

      {message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">{message}</p>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="إجمالي المفتوح" value={reports.length} />
        <MetricCard label="عاجل / عالي" value={urgentCount} tone="danger" />
        <MetricCard label="قيد التنفيذ" value={inProgressCount} tone="warning" />
      </section>

      {error ? (
        <SoftEmptyState text="تعذر تحميل المهام العارضة الآن." danger />
      ) : (
        <section className="grid gap-3">
          {reports.map((report) => (
            <AdhocTaskCard key={report.id} report={report} today={today} />
          ))}
          {!reports.length ? <SoftEmptyState text="لا توجد مهام عارضة مفتوحة مسندة إليك حالياً." /> : null}
        </section>
      )}
    </AppShell>
  );
}

function AdhocTaskCard({ report, today }: { report: AdhocReport; today: string }) {
  const isToday = report.scheduled_date === today;
  const isUrgent = report.priority === "urgent" || report.priority === "high";

  return (
    <article
      className={
        isUrgent
          ? "rounded-lg border border-[#f1c7c7] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          : "rounded-lg border border-[#dbe3ea] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={isToday ? "warning" : "neutral"}>{isToday ? "اليوم" : report.scheduled_date ?? "بدون تاريخ"}</StatusBadge>
              <StatusBadge tone={isUrgent ? "danger" : "neutral"}>{priorityLabel(report.priority)}</StatusBadge>
              <StatusBadge tone={report.status === "in_progress" ? "warning" : "neutral"}>{statusLabel(report.status)}</StatusBadge>
            </div>
            <h2 className="mt-3 break-words text-xl font-black leading-8">{report.issue}</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-[#607086]">
              {report.equipment_code ?? "-"} - {report.equipment_name ?? "معدة"} · {report.area_name ?? "منطقة غير محددة"}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[460px]">
            <Info label="آخر تحديث" value={formatDateTime(report.updated_at)} />
            <Info label="الصور" value={(report.photo_paths?.length ?? 0).toLocaleString("ar-EG")} />
            <Info label="الحالة" value={statusLabel(report.status)} />
          </div>
        </div>

        <form action={updateAdhocExecutionAction} encType="multipart/form-data" className="grid gap-3 border-t border-[#e2e8ef] pt-4 md:grid-cols-2">
          <input type="hidden" name="report_id" value={report.id} />
          <input type="hidden" name="return_to" value="/worker/ad-hoc-tasks" />
          <Field name="started_at" type="datetime-local" label="وقت البداية" defaultValue={toLocalInput(report.started_at)} />
          <Field name="ended_at" type="datetime-local" label="وقت النهاية" defaultValue={toLocalInput(report.ended_at)} />
          <label className="block text-sm font-black text-[#324155] md:col-span-2">
            تفاصيل التنفيذ
            <textarea
              name="result"
              rows={3}
              defaultValue={report.result ?? ""}
              placeholder="اكتب ما تم تنفيذه أو الوضع الحالي للمهمة"
              className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none transition focus:border-[#0b559f]"
            />
          </label>
          <label className="block text-sm font-black text-[#324155]">
            صور التنفيذ
            <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none transition focus:border-[#0b559f]" />
          </label>
          <SubmitButton className="self-end px-5" pendingText="جاري الحفظ">حفظ تقرير المهمة</SubmitButton>
        </form>
      </div>
    </article>
  );
}

function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block text-sm font-black text-[#324155]">
      {label}
      <input {...props} className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none transition focus:border-[#0b559f]" />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#dbe3ea] bg-[#f8fafc] p-3">
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 break-words font-black">{value}</p>
    </div>
  );
}

function SoftEmptyState({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg border border-dashed bg-white p-5 text-center shadow-sm ${danger ? "border-[#f1c7c7]" : "border-[#cbd7e3]"}`}>
      <p className={`text-sm font-semibold ${danger ? "text-[#c1121f]" : "text-[#607086]"}`}>{text}</p>
    </div>
  );
}

function priorityLabel(value: string) {
  if (value === "urgent") return "عاجلة";
  if (value === "high") return "عالية";
  if (value === "low") return "منخفضة";
  return "عادية";
}

function statusLabel(value: string) {
  if (value === "completed") return "مكتملة";
  if (value === "in_progress") return "قيد التنفيذ";
  if (value === "cancelled") return "ملغاة";
  return "مفتوحة";
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 16);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
}
