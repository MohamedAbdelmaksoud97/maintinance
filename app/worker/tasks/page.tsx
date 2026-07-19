import { completePlannedTaskGroupAction, submitNonExecutionGroupAction, updateAdhocExecutionAction } from "@/app/auth/actions";
import { AppShell, ContentCard, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import { getSaudiToday, SYSTEM_START_DATE } from "@/utils/operational-time";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { ChevronDown } from "lucide-react";
import Link from "next/link";

type TaskRow = {
  id: string;
  scheduled_date: string;
  planned_quantity: number | null;
  planned_quantity_unit: string | null;
  execution_condition: string | null;
  original_values: Record<string, unknown> | null;
  equipment: {
    id: string;
    equipment_code: string;
    name: string | null;
    area_id: string | null;
    areas: { name: string | null } | null;
    production_lines: { line_code: string | null; name: string | null } | null;
  } | null;
  maintenance_points: {
    point_name: string | null;
    part_description: string | null;
    execution_condition: string | null;
    running_hours_per_day: number | null;
    frequency_days: number | null;
    frequency_hours: number | null;
    last_change_date: string | null;
    last_inspection_date: string | null;
    last_grease_date: string | null;
    original_values: Record<string, unknown> | null;
  } | null;
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

type EquipmentTaskGroup = {
  id: string;
  scheduledDate: string;
  equipment: NonNullable<TaskRow["equipment"]> | null;
  tasks: TaskRow[];
};

type NotificationRow = {
  id: string;
  notification_type: string;
  scheduled_for: string;
  status: string;
  payload: Record<string, unknown> | null;
};

const workTypeOrder = ["inspection", "greasing", "oil_change", "grease_change"];

export default async function WorkerTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; message?: string }>;
}) {
  const { date, message } = await searchParams;
  const supabase = createClient(await cookies());
  const today = getSaudiToday();
  const selectedDate = validDate(date) ?? today;
  const visibleDate = selectedDate > SYSTEM_START_DATE ? selectedDate : SYSTEM_START_DATE;
  const previousDate = addDays(selectedDate, -1);
  const nextDate = addDays(selectedDate, 1);
  const { data: terminalStatuses } = await supabase.from("task_statuses").select("id").eq("is_terminal", true);
  const terminalStatusIds = (terminalStatuses ?? []).map((status) => status.id);
  const plannedTaskQuery = supabase
      .from("planned_tasks")
      .select(
        "id,scheduled_date,planned_quantity,planned_quantity_unit,execution_condition,original_values,equipment(id,equipment_code,name,area_id,areas(name),production_lines(line_code,name)),maintenance_points(point_name,part_description,execution_condition,running_hours_per_day,frequency_days,frequency_hours,last_change_date,last_inspection_date,last_grease_date,original_values),materials(name,unit),maintenance_work_types(code,name)",
      )
      .eq("scheduled_date", visibleDate)
      .order("id", { ascending: true })
      .limit(1000);
  if (terminalStatusIds.length) {
    plannedTaskQuery.not("status_id", "in", `(${terminalStatusIds.join(",")})`);
  }

  const [{ data: plannedTasks }, { data: adhocReports }, { data: notificationRows }] = await Promise.all([
    plannedTaskQuery,
    supabase
      .from("troubleshooting_reports")
      .select("id,issue,priority,status,scheduled_date,started_at,ended_at,result,photo_paths,equipment(equipment_code,name)")
      .eq("scheduled_date", visibleDate)
      .order("id", { ascending: true })
      .limit(50),
    supabase
      .from("notification_queue")
      .select("id,notification_type,scheduled_for,status,payload")
      .gte("scheduled_for", `${visibleDate}T00:00:00+03:00`)
      .lt("scheduled_for", `${nextDate}T00:00:00+03:00`)
      .order("scheduled_for", { ascending: true })
      .limit(50),
  ]);

  const tasks = (plannedTasks ?? []) as unknown as TaskRow[];
  const equipmentGroups = groupByEquipment(tasks);
  const adhoc = (adhocReports ?? []) as unknown as AdhocReport[];
  const notifications = (notificationRows ?? []) as unknown as NotificationRow[];
  const internalTaskCount = equipmentGroups.reduce((sum, group) => sum + group.tasks.length, 0);

  return (
    <AppShell navigationScope="worker">
      <PageHeader
        eyebrow="واجهة العامل"
        title="مهام اليوم"
        description="كل كارت يمثل معدة واحدة، وداخلها كل أعمال اليوم المطلوبة حسب الخطة."
        action={<StatusBadge tone={selectedDate === today ? "warning" : "neutral"}>{selectedDate}</StatusBadge>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <DayLink href={`/worker/tasks?date=${previousDate}`}>اليوم السابق</DayLink>
        <DayLink href={`/worker/tasks?date=${today}`} active={selectedDate === today}>اليوم</DayLink>
        <DayLink href={`/worker/tasks?date=${nextDate}`}>اليوم التالي</DayLink>
      </div>

      {message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">{message}</p>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        <MetricCard label="معدات مطلوبة" value={equipmentGroups.length} />
        <MetricCard label="أعمال داخلية" value={internalTaskCount} tone="warning" />
        <MetricCard label="مهام عارضة" value={adhoc.length} tone="warning" />
        <MetricCard label="إشعارات اليوم" value={notifications.length} tone="success" />
      </section>

      {notifications.length ? (
        <section className="mb-5 grid gap-2">
          {notifications.map((notification) => (
            <div key={notification.id} className="rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-bold text-[#0b559f]">
              {valueText(notification.payload?.message_ar) || notificationLabel(notification.notification_type)}
            </div>
          ))}
        </section>
      ) : null}

      <SectionTitle title="مهام الخطة حسب المعدة" count={equipmentGroups.length} />
      <section className="grid gap-3">
        {equipmentGroups.map((group) => (
          <EquipmentTaskCard key={group.id} group={group} today={today} selectedDate={visibleDate} />
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
                <SubmitButton className="self-end px-5" pendingText="جاري الحفظ">حفظ تقرير المهمة</SubmitButton>
              </form>
            </div>
          </ContentCard>
        ))}
        {!equipmentGroups.length && !adhoc.length ? (
          <ContentCard>
            <p className="text-sm font-semibold text-[#607086]">لا توجد مهام مسندة ظاهرة لهذا الحساب.</p>
          </ContentCard>
        ) : null}
      </section>
    </AppShell>
  );
}

function EquipmentTaskCard({ group, today, selectedDate }: { group: EquipmentTaskGroup; today: string; selectedDate: string }) {
  const byType = tasksByType(group.tasks);
  const inspection = byType.inspection ?? [];
  const greasing = byType.greasing ?? [];
  const oilChange = byType.oil_change ?? [];
  const greaseChange = byType.grease_change ?? [];

  return (
    <details className="group rounded-lg border border-[#dbe3ea] bg-white shadow-sm transition open:border-[#0b559f]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 outline-none transition hover:bg-[#f3f7fb] [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="text-xs font-black text-[#607086]">المعدة</p>
          <h2 className="mt-1 break-words text-lg font-black leading-7 text-[#172033]">
            {group.equipment?.equipment_code ?? "بدون كود"} - {group.equipment?.name ?? "معدة بدون اسم"}
          </h2>
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-[#607086] transition group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="border-t border-[#e2e8ef] p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={group.scheduledDate === today ? "warning" : "neutral"}>
                {group.scheduledDate === today ? "اليوم" : group.scheduledDate}
              </StatusBadge>
              <StatusBadge tone="neutral">{lineLabel(group.tasks[0])}</StatusBadge>
              <StatusBadge tone="success">{group.tasks.length.toLocaleString("ar-EG")} أعمال</StatusBadge>
            </div>
            <p className="mt-3 text-sm font-semibold text-[#607086]">{group.equipment?.areas?.name ?? "-"} · خط {lineLabel(group.tasks[0])}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
            <Info label="آخر تنفيذ مفترض" value={lastExecutionLabel(group.tasks[0])} />
            <Info label="أقرب تكرار" value={frequencyLabel(group.tasks[0])} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-[#e2e8ef] pt-4">
          <CountBadge label="فحص" count={inspection.length} />
          <CountBadge label="نقاط تشحيم" count={greasing.length} />
          <CountBadge label="تغيير زيت" count={oilChange.length} />
          <CountBadge label="تغيير شحم" count={greaseChange.length} />
        </div>

        <MaterialsSummary tasks={group.tasks} />

        <div className="mt-4 grid gap-3">
          {inspection.length ? <WorkSection title="فحص" tasks={inspection} mode="inspection" /> : null}
          {greasing.length ? <WorkSection title="إضافة شحم" tasks={greasing} mode="greasing" /> : null}
          {oilChange.length ? <WorkSection title="تغيير زيت" tasks={oilChange} mode="material" /> : null}
          {greaseChange.length ? <WorkSection title="تغيير شحم" tasks={greaseChange} mode="material" /> : null}
        </div>

        <div className="mt-4 grid gap-3 border-t border-[#e2e8ef] pt-4 xl:grid-cols-2">
          <form action={completePlannedTaskGroupAction} encType="multipart/form-data" className="grid gap-3 rounded-lg border border-[#dbe3ea] bg-[#fbfcfd] p-4">
            {group.tasks.map((task) => (
              <input key={task.id} type="hidden" name="task_ids" value={task.id} />
            ))}
            <input type="hidden" name="return_date" value={selectedDate} />
            <p className="text-sm font-black text-[#324155]">تسجيل تنفيذ الكارت</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="started_at" type="datetime-local" label="وقت البداية" />
              <Field name="completed_at" type="datetime-local" label="وقت النهاية" />
            </div>
            <label className="block text-sm font-black text-[#324155]">
              ملاحظات التنفيذ
              <textarea name="notes" rows={3} className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none" />
            </label>
            <label className="block text-sm font-black text-[#324155]">
              صور التنفيذ
              <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none" />
            </label>
            <SubmitButton pendingText="جاري الحفظ">حفظ التنفيذ</SubmitButton>
          </form>

          <form action={submitNonExecutionGroupAction} encType="multipart/form-data" className="grid gap-3 rounded-lg border border-[#f1c7c7] bg-[#fff7f7] p-4">
            {group.tasks.map((task) => (
              <input key={task.id} type="hidden" name="task_ids" value={task.id} />
            ))}
            <input type="hidden" name="return_date" value={selectedDate} />
            <div>
              <p className="text-sm font-black text-[#7f1d1d]">سبب عدم التنفيذ</p>
              <p className="mt-1 text-xs font-bold text-[#9f4a4a]">متاح الآن، والاستخدام الطبيعي بعد الساعة 4 مساء بتوقيت السعودية.</p>
            </div>
            <label className="block text-sm font-black text-[#324155]">
              السبب
              <textarea name="reason" rows={4} required className="mt-2 w-full rounded-lg border border-[#e5b7b7] bg-white px-3 py-2.5 font-semibold outline-none" />
            </label>
            <label className="block text-sm font-black text-[#324155]">
              صور أو إثباتات اختيارية
              <input name="evidence" type="file" accept="image/jpeg,image/png,image/webp" multiple className="mt-2 w-full rounded-lg border border-[#e5b7b7] bg-white px-3 py-2.5 font-semibold outline-none" />
            </label>
            <SubmitButton variant="danger" pendingText="جاري الإرسال">إرسال السبب للمدير</SubmitButton>
          </form>
        </div>
      </div>
    </details>
  );
}

function MaterialsSummary({ tasks }: { tasks: TaskRow[] }) {
  const materialTasks = tasks.filter((task) => task.materials?.name);
  if (!materialTasks.length) return null;

  return (
    <div className="mt-4 rounded-lg border border-[#dbe3ea] bg-[#fbfcfd] p-4">
      <p className="text-sm font-black text-[#324155]">المواد والكميات</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {materialTasks.map((task) => (
          <div key={task.id} className="rounded-lg bg-white p-3">
            <p className="text-xs font-black text-[#607086]">{workTypeLabel(task.maintenance_work_types?.code)}</p>
            <p className="mt-1 text-sm font-black">{task.materials?.name ?? "-"}</p>
            <p className="mt-1 text-xs font-bold text-[#607086]">{quantityLabel(task)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkSection({ title, tasks, mode }: { title: string; tasks: TaskRow[]; mode: "inspection" | "greasing" | "material" }) {
  return (
    <section className="rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-black">{title}</h3>
        <StatusBadge tone="neutral">{tasks.length.toLocaleString("ar-EG")}</StatusBadge>
      </div>
      <div className="grid gap-2">
        {tasks.map((task, index) => (
          <div key={task.id} className="grid gap-2 rounded-lg border border-[#dbe3ea] bg-white p-3 text-sm md:grid-cols-4">
            <Info label={mode === "greasing" ? "الجزء" : "نقطة/جزء العمل"} value={partLabel(task, index)} />
            <Info label={mode === "greasing" ? "عدد النقاط" : "نوع العملية"} value={mode === "greasing" ? valueText(task.maintenance_points?.point_name) || "-" : workTypeLabel(task.maintenance_work_types?.code)} />
            <Info label="المادة" value={task.materials?.name ?? "-"} />
            <Info label="الكمية" value={quantityLabel(task)} />
          </div>
        ))}
      </div>
    </section>
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

function DayLink({ href, children, active = false }: { href: string; children: React.ReactNode; active?: boolean }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-lg bg-[#0b559f] px-3.5 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#0a3f78]"
          : "rounded-lg border border-[#cbd7e3] bg-white px-3.5 py-2 text-sm font-extrabold text-[#324155] shadow-sm transition hover:border-[#0b559f] hover:text-[#0b559f]"
      }
    >
      {children}
    </Link>
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
    <div className="min-w-0 rounded-lg border border-[#dbe3ea] bg-[#f8fafc] p-3">
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 break-words font-black">{value}</p>
    </div>
  );
}

function CountBadge({ label, count }: { label: string; count: number }) {
  return (
    <span className="rounded-lg border border-[#dbe3ea] bg-[#f8fafc] px-3 py-2 text-sm font-black text-[#324155]">
      {label}: {count.toLocaleString("ar-EG")}
    </span>
  );
}

function groupByEquipment(tasks: TaskRow[]): EquipmentTaskGroup[] {
  const groups = new Map<string, TaskRow[]>();

  for (const task of tasks) {
    const key = [task.scheduled_date, physicalEquipmentKey(task.equipment)].join("|");
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }

  return Array.from(groups.entries())
    .map(([id, groupTasks]) => ({
      id,
      scheduledDate: groupTasks[0]?.scheduled_date ?? "",
      equipment: groupTasks[0]?.equipment ?? null,
      tasks: groupTasks.sort((a, b) => workTypeRank(a) - workTypeRank(b)),
    }))
    .sort((a, b) => (a.equipment?.equipment_code ?? "").localeCompare(b.equipment?.equipment_code ?? ""));
}

function tasksByType(tasks: TaskRow[]) {
  return Object.groupBy(tasks, (task) => task.maintenance_work_types?.code ?? "unknown");
}

function physicalEquipmentKey(equipment: NonNullable<TaskRow["equipment"]> | null) {
  return [equipment?.area_id ?? "unknown-area", normalizeKey(equipment?.equipment_code ?? "unknown-equipment")].join("|");
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function workTypeRank(task: TaskRow) {
  const index = workTypeOrder.indexOf(task.maintenance_work_types?.code ?? "");
  return index === -1 ? 99 : index;
}

function workTypeLabel(value?: string | null) {
  if (value === "inspection") return "فحص";
  if (value === "oil_change") return "تغيير زيت";
  if (value === "greasing") return "إضافة شحم";
  if (value === "grease_change") return "تغيير شحم";
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

function notificationLabel(value: string) {
  if (value === "daily_task") return "لديك مهمة صيانة اليوم";
  if (value === "rescheduled_task") return "تم تحديد موعد جديد لمهمة صيانة";
  if (value === "adhoc_task") return "تم إسناد مهمة عارضة جديدة لك";
  return "إشعار جديد";
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 16);
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function pointValues(task: TaskRow) {
  return task.maintenance_points?.original_values ?? task.original_values ?? {};
}

function lineLabel(task: TaskRow) {
  const value = task.equipment?.production_lines?.line_code ?? valueText(pointValues(task).line_code);
  return value || "-";
}

function lastExecutionLabel(task: TaskRow) {
  const value = valueText(task.original_values?.previous_scheduled_date) || valueText(pointValues(task).previous_scheduled_date);
  return value || "-";
}

function frequencyLabel(task: TaskRow) {
  const point = task.maintenance_points;
  const days = point?.frequency_days ?? valueText(pointValues(task).frequency_days);
  const hours = point?.frequency_hours ?? valueText(pointValues(task).frequency_hours);
  if (days) return `${days} يوم`;
  if (hours) return `${hours} ساعة`;
  return "-";
}

function partLabel(task: TaskRow, index: number) {
  return task.maintenance_points?.part_description?.trim() || task.maintenance_points?.point_name || `بند ${index + 1}`;
}

function quantityLabel(task: TaskRow) {
  const unit = task.planned_quantity_unit || task.materials?.unit || "";
  if (typeof task.planned_quantity !== "number") return unit ? `- ${unit}` : "-";
  return `${task.planned_quantity.toLocaleString("ar-EG")} ${unit}`;
}

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
