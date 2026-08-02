import { assignUrgentPlannedTaskAction } from "@/app/auth/actions";
import { FlashToast } from "@/app/ui/flash-toast";
import { AppShell, ContentCard, MetricCard, NavButton, PageHeader, StatusBadge } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import { getSaudiToday } from "@/utils/operational-time";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

type WorkerOption = {
  id: string;
  full_name: string;
  employee_code: string | null;
  job_title: string | null;
};

type UrgentReport = {
  id: string;
  reason: string;
  evidence_paths: string[] | null;
  created_at: string;
  reassigned_task_id: string | null;
  workers: { full_name: string | null } | null;
  planned_tasks: {
    id: string;
    scheduled_date: string;
    original_due_date: string;
    is_urgent: boolean | null;
    urgent_attempt_no: number | null;
    planned_quantity: number | null;
    planned_quantity_unit: string | null;
    execution_condition: string | null;
    equipment: {
      equipment_code: string | null;
      name: string | null;
      areas: { name: string | null } | null;
      production_lines: { line_code: string | null; name: string | null } | null;
    } | null;
    maintenance_points: { point_name: string | null; part_description: string | null } | null;
    materials: { name: string | null; unit: string | null; material_kind: string | null } | null;
    maintenance_work_types: { code: string | null; name: string | null } | null;
  } | null;
};

export default async function UrgentPlannedTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; date?: string }>;
}) {
  const params = await searchParams;
  const today = getSaudiToday();
  const defaultDate = validDate(params.date) ?? today;
  const supabase = createClient(await cookies());

  const [{ data: reports, error }, { data: workers }] = await Promise.all([
    supabase
      .from("non_execution_reports")
      .select(
        "id,reason,evidence_paths,created_at,reassigned_task_id,workers(full_name),planned_tasks!non_execution_reports_task_id_fkey(id,scheduled_date,original_due_date,is_urgent,urgent_attempt_no,planned_quantity,planned_quantity_unit,execution_condition,equipment(equipment_code,name,areas(name),production_lines(line_code,name)),maintenance_points(point_name,part_description),materials(name,unit,material_kind),maintenance_work_types(code,name))",
      )
      .eq("approval_status", "pending")
      .is("reassigned_task_id", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("workers")
      .select("id,full_name,employee_code,job_title")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
  ]);

  const rows = ((reports ?? []) as unknown as UrgentReport[]).filter((report) => Boolean(report.planned_tasks?.id));
  const workerOptions = (workers ?? []) as WorkerOption[];
  const urgentAttempts = rows.filter((report) => report.planned_tasks?.is_urgent).length;
  const normalMissed = rows.length - urgentAttempts;

  const signedUrls = await signedEvidenceUrls(
    supabase,
    rows.flatMap((report) => report.evidence_paths ?? []),
  );

  return (
    <AppShell actions={<NavButton href="/admin/planned-tasks" variant="secondary">العودة لخطة الصيانة</NavButton>}>
      <PageHeader
        eyebrow="مهام الخطة العاجلة"
        title="مهام لم تُنفذ وتحتاج إسناد عامل"
        description="هذه القائمة تعرض مهام الخطة التي سجل العامل سبب عدم تنفيذها ولم يتم إنشاء محاولة عاجلة لها بعد."
        action={<StatusBadge tone={rows.length ? "danger" : "success"}>{formatCount(rows.length)} قيد الإسناد</StatusBadge>}
      />

      <FlashToast message={params.message} />

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="إجمالي قيد الإسناد" value={rows.length} tone={rows.length ? "danger" : "success"} />
        <MetricCard label="من الخطة الأصلية" value={normalMissed} tone="warning" />
        <MetricCard label="محاولات عاجلة سابقة" value={urgentAttempts} />
      </section>

      {error ? (
        <ContentCard>
          <p className="text-sm font-bold text-[#c1121f]">تعذر تحميل مهام الخطة العاجلة الآن.</p>
        </ContentCard>
      ) : (
        <section className="grid gap-3">
          {rows.map((report) => (
            <UrgentReportCard
              key={report.id}
              report={report}
              workers={workerOptions}
              defaultDate={defaultDate}
              evidenceUrls={signedUrls}
            />
          ))}
          {!rows.length ? (
            <ContentCard>
              <p className="text-sm font-bold text-[#207a45]">لا توجد مهام خطة عاجلة تحتاج إسنادًا الآن.</p>
            </ContentCard>
          ) : null}
        </section>
      )}
    </AppShell>
  );
}

function UrgentReportCard({
  report,
  workers,
  defaultDate,
  evidenceUrls,
}: {
  report: UrgentReport;
  workers: WorkerOption[];
  defaultDate: string;
  evidenceUrls: Map<string, string>;
}) {
  const task = report.planned_tasks;
  const evidence = (report.evidence_paths ?? []).flatMap((path) => {
    const url = evidenceUrls.get(path);
    return url ? [{ path, url }] : [];
  });

  return (
    <article className="rounded-lg border border-[#f1c7c7] bg-white p-5 shadow-sm">
      <div className="grid gap-5 xl:grid-cols-[1fr_380px] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="danger">تحتاج عامل</StatusBadge>
            <StatusBadge tone="warning">{task?.is_urgent ? `محاولة ${formatCount(task.urgent_attempt_no ?? 1)}` : "من الخطة"}</StatusBadge>
            <StatusBadge>{task?.scheduled_date ?? "-"}</StatusBadge>
            <StatusBadge tone="neutral">{workTypeLabel(task?.maintenance_work_types?.code)}</StatusBadge>
          </div>
          <h2 className="mt-3 break-words text-lg font-black text-[#172033]">
            {task?.equipment?.equipment_code ?? "بدون كود"} - {task?.equipment?.name ?? "معدة بدون اسم"}
          </h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-[#607086]">
            {task?.equipment?.areas?.name ?? "-"} · خط {task?.equipment?.production_lines?.line_code ?? "-"} · {task?.maintenance_points?.part_description ?? task?.maintenance_points?.point_name ?? "-"}
          </p>

          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <Info label="العامل السابق" value={report.workers?.full_name ?? "-"} />
            <Info label="تاريخ الخطة الأصلي" value={task?.original_due_date ?? task?.scheduled_date ?? "-"} />
            <Info label="المادة" value={task?.materials?.name ?? "-"} />
            <Info label="الكمية" value={quantityLabel(task)} />
          </div>

          <div className="mt-4 rounded-lg border border-[#f1c7c7] bg-[#fff7f7] p-3">
            <p className="text-xs font-black text-[#7f1d1d]">سبب عدم التنفيذ</p>
            <p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6 text-[#172033]">{report.reason}</p>
            <p className="mt-2 text-xs font-bold text-[#607086]">وقت التسجيل: {formatDateTime(report.created_at)}</p>
          </div>

          {evidence.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {evidence.map((item, index) => (
                <a
                  key={item.path}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-[#dbe3ea] bg-[#f8fafc] px-3 py-2 text-xs font-black text-[#0b559f] transition hover:border-[#0b559f]"
                >
                  إثبات {formatCount(index + 1)}
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <form action={assignUrgentPlannedTaskAction} className="grid gap-3 rounded-lg border border-[#dbe3ea] bg-[#fbfcfd] p-4">
          <input type="hidden" name="task_id" value={task?.id ?? ""} />
          <input type="hidden" name="return_date" value={defaultDate} />
          <p className="text-sm font-black text-[#324155]">إسناد كمهمة خطة عاجلة</p>
          <label className="block text-xs font-black text-[#324155]">
            العامل الجديد
            <select name="worker_id" required className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-bold outline-none">
              <option value="">اختر العامل</option>
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.full_name}{worker.employee_code ? ` - ${worker.employee_code}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-black text-[#324155]">
            تاريخ التنفيذ
            <input name="scheduled_date" type="date" required defaultValue={defaultDate} className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-bold outline-none" />
          </label>
          <label className="block text-xs font-black text-[#324155]">
            ملاحظة للعمالة
            <textarea name="reason" rows={3} className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-semibold outline-none" />
          </label>
          <SubmitButton pendingText="جاري الإسناد">إسناد عاجل</SubmitButton>
        </form>
      </div>
    </article>
  );
}

async function signedEvidenceUrls(supabase: ReturnType<typeof createClient>, paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  if (!uniquePaths.length) return new Map<string, string>();
  const { data } = await supabase.storage.from("maintenance-photos").createSignedUrls(uniquePaths, 60 * 30);
  return new Map((data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e2e8ef] bg-[#f8fafc] p-3">
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-[#172033]">{value}</p>
    </div>
  );
}

function quantityLabel(task: UrgentReport["planned_tasks"]) {
  if (!task?.planned_quantity) return "-";
  return `${formatCount(task.planned_quantity)} ${task.planned_quantity_unit ?? task.materials?.unit ?? ""}`.trim();
}

function workTypeLabel(value: string | null | undefined) {
  if (value === "inspection") return "فحص";
  if (value === "greasing") return "إضافة شحم";
  if (value === "oil_change") return "تغيير زيت";
  if (value === "grease_change") return "تغيير شحم";
  return "مهمة خطة";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
}

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}
