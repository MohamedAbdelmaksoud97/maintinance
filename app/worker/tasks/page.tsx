import { updateAdhocExecutionAction } from "@/app/auth/actions";
import { AppShell, ContentCard, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { getSaudiToday, SYSTEM_START_DATE } from "@/utils/operational-time";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

type TaskRow = {
  id: string;
  scheduled_date: string;
  planned_quantity: number | null;
  planned_quantity_unit: string | null;
  equipment: { equipment_code: string; name: string | null } | null;
  maintenance_points: { point_name: string | null; execution_condition: string } | null;
  materials: { name: string; unit: string | null } | null;
  maintenance_work_types: { code: string; name: string } | null;
};

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
  equipment: { equipment_code: string; name: string | null } | null;
};

export default async function WorkerTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const supabase = createClient(await cookies());
  const today = getSaudiToday();
  const visibleFrom = today > SYSTEM_START_DATE ? today : SYSTEM_START_DATE;
  const { data: oldStatus } = await supabase.from("task_statuses").select("id").eq("code", "OLD").maybeSingle();
  const [{ data: plannedTasks }, { data: adhocReports }] = await Promise.all([
    supabase
      .from("planned_tasks")
      .select(
        "id,scheduled_date,planned_quantity,planned_quantity_unit,equipment(equipment_code,name),maintenance_points(point_name,execution_condition),materials(name,unit),maintenance_work_types(code,name)",
      )
      .gte("scheduled_date", visibleFrom)
      .neq("status_id", oldStatus?.id ?? "00000000-0000-0000-0000-000000000000")
      .order("scheduled_date", { ascending: true })
      .limit(50),
    supabase
      .from("troubleshooting_reports")
      .select("id,issue,priority,status,scheduled_date,started_at,ended_at,result,photo_paths,equipment(equipment_code,name)")
      .gte("scheduled_date", visibleFrom)
      .order("scheduled_date", { ascending: true })
      .limit(50),
  ]);

  const tasks = (plannedTasks ?? []) as unknown as TaskRow[];
  const adhoc = (adhocReports ?? []) as unknown as AdhocReport[];
  const todayTasks = tasks.filter((task) => task.scheduled_date === today).length;
  const todayAdhoc = adhoc.filter((task) => task.scheduled_date === today).length;

  return (
    <AppShell navigationScope="worker">
      <PageHeader
        eyebrow="واجهة العامل"
        title="مهامي اليومية"
        description="هذه الصفحة تعرض مهام الخطة والمهام العارضة المسندة للعامل حسب توقيت السعودية."
        action={<StatusBadge>إشعار 9 صباحًا</StatusBadge>}
      />

      {message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">{message}</p>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        <MetricCard label="مهام خطة اليوم" value={todayTasks} />
        <MetricCard label="مهام عارضة اليوم" value={todayAdhoc} tone="warning" />
        <MetricCard label="المهام القادمة" value={tasks.length + adhoc.length} />
        <MetricCard label="حالة العرض" value="مهامي فقط" tone="success" />
      </section>

      <SectionTitle title="مهام الخطة" count={tasks.length} />
      <section className="grid gap-3">
        {tasks.map((task) => (
          <ContentCard key={task.id}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={task.scheduled_date === today ? "warning" : "neutral"}>
                    {task.scheduled_date === today ? "اليوم" : task.scheduled_date}
                  </StatusBadge>
                  <StatusBadge>{workTypeLabel(task.maintenance_work_types?.code)}</StatusBadge>
                </div>
                <h2 className="mt-3 text-xl font-black">
                  {task.equipment?.equipment_code} - {task.equipment?.name ?? "معدة بدون اسم"}
                </h2>
                <p className="mt-1 text-sm text-[#607086]">
                  {task.maintenance_points?.point_name ?? "نقطة صيانة"} | {task.materials?.name ?? "مادة غير محددة"}
                </p>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[420px]">
                <Info label="الكمية المخططة" value={`${task.planned_quantity ?? "-"} ${task.planned_quantity_unit ?? ""}`} />
                <Info label="شرط التنفيذ" value={conditionLabel(task.maintenance_points?.execution_condition)} />
                <Info label="المطلوب" value="تقرير وصورة" />
              </div>
            </div>
          </ContentCard>
        ))}
      </section>

      <SectionTitle title="المهام العارضة" count={adhoc.length} />
      <section className="grid gap-3">
        {adhoc.map((report) => (
          <ContentCard key={report.id}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={report.scheduled_date === today ? "warning" : "neutral"}>
                      {report.scheduled_date === today ? "اليوم" : report.scheduled_date ?? "-"}
                    </StatusBadge>
                    <StatusBadge>{priorityLabel(report.priority)}</StatusBadge>
                    <StatusBadge tone={report.status === "completed" ? "success" : "neutral"}>{statusLabel(report.status)}</StatusBadge>
                  </div>
                  <h2 className="mt-3 text-xl font-black">{report.issue}</h2>
                  <p className="mt-1 text-sm text-[#607086]">
                    {report.equipment?.equipment_code ?? "-"} - {report.equipment?.name ?? "معدة"}
                  </p>
                </div>
                <Info label="الصور المرفوعة" value={(report.photo_paths?.length ?? 0).toLocaleString("ar-EG")} />
              </div>

              <form action={updateAdhocExecutionAction} encType="multipart/form-data" className="grid gap-3 border-t border-[#e2e8ef] pt-4 md:grid-cols-2">
                <input type="hidden" name="report_id" value={report.id} />
                <Field name="started_at" type="datetime-local" label="وقت البداية" defaultValue={toLocalInput(report.started_at)} />
                <Field name="ended_at" type="datetime-local" label="وقت النهاية" defaultValue={toLocalInput(report.ended_at)} />
                <label className="block text-sm font-black text-[#324155] md:col-span-2">
                  نتيجة التنفيذ
                  <textarea name="result" rows={3} defaultValue={report.result ?? ""} className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none" />
                </label>
                <label className="block text-sm font-black text-[#324155]">
                  صور التنفيذ
                  <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none" />
                </label>
                <button className="self-end rounded-lg bg-[#0b559f] px-5 py-3 text-sm font-black text-white shadow-sm">حفظ تقرير المهمة</button>
              </form>
            </div>
          </ContentCard>
        ))}
        {!tasks.length && !adhoc.length ? (
          <ContentCard>
            <p className="text-sm font-semibold text-[#607086]">لا توجد مهام مسندة ظاهرة لهذا الحساب.</p>
          </ContentCard>
        ) : null}
      </section>
    </AppShell>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 mt-6 flex items-center justify-between">
      <h2 className="text-lg font-black">{title}</h2>
      <StatusBadge>{count.toLocaleString("ar-EG")}</StatusBadge>
    </div>
  );
}

function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block text-sm font-black text-[#324155]">
      {label}
      <input {...props} className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none" />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#dbe3ea] bg-[#f8fafc] p-3">
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  );
}

function conditionLabel(value?: string) {
  if (value === "running") return "قيد التنفيذ";
  if (value === "shutdown") return "أثناء التوقف";
  return "قابل للضبط";
}

function workTypeLabel(value?: string | null) {
  if (value === "inspection") return "فحص";
  if (value === "oil_change") return "تغيير زيت";
  if (value === "greasing") return "تشحيم";
  return "مهمة صيانة";
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
