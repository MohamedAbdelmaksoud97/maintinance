import { reschedulePlannedTaskGroupAction } from "@/app/auth/actions";
import { AdminCompleteToggle } from "@/app/admin/planned-tasks/admin-complete-toggle";
import { FlashToast } from "@/app/ui/flash-toast";
import { AppShell, ContentCard, MetricCard, NavButton, PageHeader, StatusBadge } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import { getSaudiToday, SYSTEM_START_DATE } from "@/utils/operational-time";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const pageSize = 30;
const workTypeOrder = ["inspection", "greasing", "oil_change", "grease_change"];
const areaTabCodes = ["CRUSHER", "KLIN", "FINISH_MILL", "PACKHOUSE"];

type PlannedTask = {
  id: string;
  scheduled_date: string;
  planned_quantity: number | null;
  planned_quantity_unit: string | null;
  main_worker_id: string | null;
  completed_at: string | null;
  execution_condition: string | null;
  original_values: Record<string, unknown> | null;
  task_statuses: { code: string | null; is_terminal: boolean | null } | null;
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
  materials: { name: string | null; unit: string | null } | null;
  maintenance_work_types: { code: string | null; name: string | null } | null;
};

type EquipmentTaskGroup = {
  id: string;
  scheduledDate: string;
  equipment: NonNullable<PlannedTask["equipment"]> | null;
  tasks: PlannedTask[];
};

type AreaTab = {
  id: string;
  code: string;
  name: string;
};

type NonExecutionReport = {
  id: string;
  reason: string;
  created_at: string;
  workers: { full_name: string | null } | null;
  planned_tasks: {
    id: string;
    scheduled_date: string;
    equipment: {
      id: string;
      equipment_code: string;
      name: string | null;
      area_id: string | null;
      areas: { name: string | null } | null;
    } | null;
  } | null;
};

type NonExecutionGroup = {
  id: string;
  scheduledDate: string;
  equipment: NonNullable<NonExecutionReport["planned_tasks"]>["equipment"] | null;
  reports: NonExecutionReport[];
};

export default async function PlannedTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; page?: string; message?: string; area?: string }>;
}) {
  const params = await searchParams;
  const today = getSaudiToday();
  const selectedDate = validDate(params.date) ?? today;
  const selectedAreaCode: string | null = areaTabCodes.includes(params.area ?? "") ? params.area ?? null : null;
  const page = Math.max(1, Number(params.page ?? 1));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const supabase = createClient(await cookies());
  const visibleDate = selectedDate > SYSTEM_START_DATE ? selectedDate : SYSTEM_START_DATE;
  const { data: oldStatus } = await supabase.from("task_statuses").select("id").eq("code", "OLD").maybeSingle();
  const { data: areaRows } = await supabase.from("areas").select("id,code,name").in("code", areaTabCodes).eq("is_active", true);
  const areaTabs = orderAreaTabs((areaRows ?? []) as unknown as AreaTab[]);
  const selectedArea = areaTabs.find((area) => area.code === selectedAreaCode) ?? null;
  const previousDate = addDays(selectedDate, -1);
  const nextDate = addDays(selectedDate, 1);

  const taskQuery = supabase
    .from("planned_tasks")
    .select(
      "id,scheduled_date,planned_quantity,planned_quantity_unit,main_worker_id,completed_at,execution_condition,original_values,task_statuses(code,is_terminal),equipment!inner(id,equipment_code,name,area_id,areas(name),production_lines(line_code,name)),maintenance_points(point_name,part_description,execution_condition,running_hours_per_day,frequency_days,frequency_hours,last_change_date,last_inspection_date,last_grease_date,original_values),materials(name,unit),maintenance_work_types(code,name)",
    )
    .eq("scheduled_date", visibleDate)
    .order("id", { ascending: true })
    .limit(1000);
  if (oldStatus?.id) {
    taskQuery.neq("status_id", oldStatus.id);
  }
  if (selectedArea) {
    taskQuery.eq("equipment.area_id", selectedArea.id);
  }

  const [{ data: taskRows, error: tasksError }, { data: nonExecutionRows }] = await Promise.all([
    taskQuery,
    supabase
      .from("non_execution_reports")
      .select("id,reason,created_at,workers(full_name),planned_tasks(id,scheduled_date,equipment(id,equipment_code,name,area_id,areas(name)))")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const tasks = (taskRows ?? []) as unknown as PlannedTask[];
  const equipmentGroups = groupByEquipment(tasks);
  const nonExecutionGroups = groupNonExecutionReports((nonExecutionRows ?? []) as unknown as NonExecutionReport[], selectedArea?.id ?? null);
  const pagedGroups = equipmentGroups.slice(from, to + 1);
  const total = equipmentGroups.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const assignedCount = equipmentGroups.filter((group) => group.tasks.every((task) => task.main_worker_id)).length;
  const unassignedCount = equipmentGroups.filter((group) => group.tasks.some((task) => !task.main_worker_id)).length;
  const internalTaskCount = equipmentGroups.reduce((sum, group) => sum + group.tasks.length, 0);

  return (
    <AppShell actions={<NavButton href="/admin/planned-tasks/new">إضافة مهمة للخطة</NavButton>}>
      <PageHeader
        eyebrow="خطة الصيانة"
        title="مهام اليوم حسب المعدة"
        description="كل كارت يمثل معدة واحدة، وداخله تفاصيل الفحص والتشحيم والزيت المطلوبة لذلك اليوم."
        action={<StatusBadge tone={selectedDate === today ? "success" : "neutral"}>{selectedDate}</StatusBadge>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <NavButton href={plannedTasksHref(previousDate, selectedAreaCode)} variant="secondary">اليوم السابق</NavButton>
        <NavButton href={plannedTasksHref(today, selectedAreaCode)} variant={selectedDate === today ? "primary" : "secondary"}>اليوم</NavButton>
        <NavButton href={plannedTasksHref(nextDate, selectedAreaCode)} variant="secondary">اليوم التالي</NavButton>
      </div>

      <AreaTabs areas={areaTabs} selectedAreaCode={selectedAreaCode} selectedDate={selectedDate} />

      <FlashToast message={params.message} />

      {tasksError ? (
        <ContentCard>
          <p className="text-sm font-bold text-[#c1121f]">تعذر تحميل المهام الآن. أعد المحاولة بعد لحظات.</p>
        </ContentCard>
      ) : (
        <>
          <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="معدات مطلوبة" value={formatCount(total)} />
            <MetricCard label="أعمال داخلية" value={formatCount(internalTaskCount)} tone="warning" />
            <MetricCard label="تحتاج تعيين عامل" value={formatCount(unassignedCount)} tone="warning" />
            <MetricCard label="مراجعات مطلوبة" value={formatCount(nonExecutionGroups.length)} tone="danger" />
          </section>

          {nonExecutionGroups.length ? (
            <ContentCard>
              <div className="mb-4 flex flex-col gap-2 border-b border-[#e2e8ef] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-black">مراجعات تحتاج موعداً جديداً</h2>
                  <p className="mt-1 text-sm font-semibold text-[#607086]">راجع الملاحظات المسجلة وحدد موعداً مناسباً لاستكمال العمل.</p>
                </div>
                <StatusBadge tone="danger">{formatCount(nonExecutionGroups.length)}</StatusBadge>
              </div>
              <div className="grid gap-3">
                {nonExecutionGroups.map((group) => (
                  <NonExecutionCard key={group.id} group={group} returnDate={selectedDate} />
                ))}
              </div>
            </ContentCard>
          ) : null}

          <ContentCard>
            <div className="mb-4 flex flex-col gap-2 border-b border-[#e2e8ef] pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black">قائمة المعدات</h2>
              <p className="mt-1 text-sm font-semibold text-[#607086]">
                  عرض {formatCount(total ? from + 1 : 0)} - {formatCount(Math.min(to + 1, total))} من{" "}
                  {formatCount(total)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone="success">{formatCount(assignedCount)} تم تعيينها</StatusBadge>
                <StatusBadge tone="warning">{formatCount(unassignedCount)} تحتاج عامل</StatusBadge>
              </div>
            </div>

            <div className="grid gap-3">
              {pagedGroups.map((group) => (
                <EquipmentTaskCard key={group.id} group={group} page={page} />
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e2e8ef] pt-4">
              <PageLink disabled={page <= 1} href={plannedTasksHref(selectedDate, selectedAreaCode, page - 1)}>السابق</PageLink>
              <p className="text-sm font-bold text-[#607086]">
                صفحة {formatCount(page)} من {formatCount(totalPages)}
              </p>
              <PageLink disabled={page >= totalPages} href={plannedTasksHref(selectedDate, selectedAreaCode, page + 1)}>التالي</PageLink>
            </div>
          </ContentCard>
        </>
      )}
    </AppShell>
  );
}

function AreaTabs({ areas, selectedAreaCode, selectedDate }: { areas: AreaTab[]; selectedAreaCode: string | null; selectedDate: string }) {
  return (
    <nav className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="فلترة خطة الصيانة حسب المكان">
      {areas.map((area) => {
        const active = selectedAreaCode === area.code;
        return (
          <Link
            key={area.id}
            href={plannedTasksHref(selectedDate, area.code)}
            className={
              active
                ? "rounded-lg border border-[#0b559f] bg-[#0b559f] px-4 py-3 text-center text-sm font-black text-white shadow-sm"
                : "rounded-lg border border-[#dbe3ea] bg-white px-4 py-3 text-center text-sm font-black text-[#324155] shadow-sm transition hover:border-[#0b559f] hover:text-[#0b559f]"
            }
          >
            {area.name}
          </Link>
        );
      })}
    </nav>
  );
}

function NonExecutionCard({ group, returnDate }: { group: NonExecutionGroup; returnDate: string }) {
  return (
    <section className="rounded-lg border border-[#f1c7c7] bg-[#fff7f7] p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="danger">بحاجة لمراجعة</StatusBadge>
            <StatusBadge>{group.scheduledDate}</StatusBadge>
            <StatusBadge tone="neutral">{formatCount(group.reports.length)} أعمال داخلية</StatusBadge>
          </div>
          <h3 className="mt-3 text-base font-black text-[#172033]">
            {group.equipment?.equipment_code ?? "لايوجد"} - {group.equipment?.name ?? "لايوجد"}
          </h3>
          <p className="mt-1 text-sm font-semibold text-[#607086]">{group.equipment?.areas?.name ?? "لايوجد"}</p>
        </div>
        <form action={reschedulePlannedTaskGroupAction} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
          {group.reports.map((report) => (
            <input key={report.id} type="hidden" name="task_ids" value={report.planned_tasks?.id ?? ""} />
          ))}
          <input type="hidden" name="return_date" value={returnDate} />
          <input name="new_date" type="date" required defaultValue={group.scheduledDate} className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-bold outline-none" />
          <input name="reason" placeholder="ملاحظة اختيارية" className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-bold outline-none" />
          <SubmitButton className="px-4 py-2.5" pendingText="جاري الحفظ">اعتماد الموعد</SubmitButton>
        </form>
      </div>
      <div className="mt-3 grid gap-2">
        {group.reports.map((report) => (
          <div key={report.id} className="rounded-lg border border-[#f1c7c7] bg-white p-3 text-sm">
            <p className="font-black text-[#7f1d1d]">{report.reason}</p>
            <p className="mt-1 text-xs font-bold text-[#607086]">
              العامل: {report.workers?.full_name ?? "لايوجد"} · {formatDateTime(report.created_at)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function EquipmentTaskCard({ group, page }: { group: EquipmentTaskGroup; page: number }) {
  const byType = tasksByType(group.tasks);
  const inspection = byType.inspection ?? [];
  const greasing = byType.greasing ?? [];
  const oilChange = byType.oil_change ?? [];
  const greaseChange = byType.grease_change ?? [];
  const fullyAssigned = group.tasks.every((task) => task.main_worker_id);
  const isCompleted = group.tasks.every(isTaskCompleted);
  const canReopen = isCompleted && group.tasks.every((task) => task.original_values?.completed_by_admin === true);

  return (
    <details className={`group rounded-lg border shadow-sm transition open:border-[#0b559f] open:bg-white ${isCompleted ? "border-[#b7dfc7] bg-[#f4fbf6]" : "border-[#dbe3ea] bg-[#fbfcfd]"}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 outline-none transition hover:bg-[#f3f7fb] [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="text-xs font-black text-[#607086]">المعدة</p>
          <h3 className="mt-1 break-words text-base font-black text-[#172033]">
            {group.equipment?.equipment_code ?? "لايوجد"} - {group.equipment?.name ?? "لايوجد"}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <AdminCompleteToggle
            taskIds={group.tasks.map((task) => task.id)}
            scheduledDate={group.scheduledDate}
            isCompleted={isCompleted}
            canReopen={canReopen}
          />
          <ChevronDown className="h-5 w-5 text-[#607086] transition group-open:rotate-180" aria-hidden="true" />
        </div>
      </summary>

      <div className="border-t border-[#e2e8ef] p-4">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr_auto] xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={fullyAssigned ? "success" : "warning"}>{fullyAssigned ? "تم التعيين" : "تحتاج عامل"}</StatusBadge>
              {isCompleted ? <StatusBadge tone="success">مكتملة</StatusBadge> : null}
              <StatusBadge>{group.scheduledDate}</StatusBadge>
              <StatusBadge tone="neutral">خط {lineLabel(group.tasks[0])}</StatusBadge>
              <StatusBadge tone="success">{formatCount(group.tasks.length)} أعمال</StatusBadge>
            </div>
            <p className="mt-3 text-sm font-semibold text-[#607086]">{group.equipment?.areas?.name ?? "لايوجد"}</p>
          </div>
          <MaterialsSummary tasks={group.tasks} compact />
          <StatusBadge tone={executionTone(group.tasks.some((task) => executionCondition(task) === "shutdown") ? "shutdown" : "running")}>
            {group.tasks.some((task) => executionCondition(task) === "shutdown") ? "تحتاج توقف" : "أثناء العمل"}
          </StatusBadge>
        </div>

        <div className="mt-4 grid gap-2 border-t border-[#e2e8ef] pt-4 sm:grid-cols-2 xl:grid-cols-5">
          <Info label="المنطقة" value={group.equipment?.areas?.name ?? "لايوجد"} />
          <Info label="الخط" value={lineLabel(group.tasks[0])} />
          <Info label="آخر تنفيذ مفترض" value={lastExecutionLabel(group.tasks[0])} />
          <Info label="أقرب تكرار" value={frequencyLabel(group.tasks[0])} />
          <Info label="ساعات التشغيل اليومية" value={runningHoursLabel(group.tasks[0])} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <CountBadge label="فحص" count={inspection.length} />
          <CountBadge label="نقاط تشحيم" count={greasing.length} />
          <CountBadge label="تغيير زيت" count={oilChange.length} />
          <CountBadge label="تغيير شحم" count={greaseChange.length} />
        </div>

        <MaterialsSummary tasks={group.tasks} />

        <div className="mt-4 grid gap-3">
          {inspection.length ? <WorkSection title="فحص" tasks={inspection} mode="inspection" page={page} /> : null}
          {greasing.length ? <WorkSection title="إضافة شحم" tasks={greasing} mode="greasing" page={page} /> : null}
          {oilChange.length ? <WorkSection title="تغيير زيت" tasks={oilChange} mode="material" page={page} /> : null}
          {greaseChange.length ? <WorkSection title="تغيير شحم" tasks={greaseChange} mode="material" page={page} /> : null}
        </div>
      </div>
    </details>
  );
}

function isTaskCompleted(task: PlannedTask) {
  return Boolean(task.completed_at) || task.task_statuses?.code === "COMPLETED";
}

function MaterialsSummary({ tasks, compact = false }: { tasks: PlannedTask[]; compact?: boolean }) {
  const materialTasks = tasks.filter((task) => task.materials?.name);
  if (!materialTasks.length) return <Info label="المواد والكميات" value="لايوجد" />;

  if (compact) {
    return <Info label="المواد والكميات" value={materialTasks.map((task) => `${task.materials?.name ?? "لايوجد"} ${quantityLabel(task)}`).join("، ")} />;
  }

  return (
    <div className="mt-4 rounded-lg border border-[#dbe3ea] bg-white p-4">
      <p className="text-sm font-black text-[#324155]">المواد والكميات</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {materialTasks.map((task) => (
          <div key={task.id} className="rounded-lg border border-[#e2e8ef] bg-[#f8fafc] p-3">
            <p className="text-xs font-black text-[#607086]">{workTypeLabel(task.maintenance_work_types?.code)}</p>
            <p className="mt-1 text-sm font-black">{task.materials?.name ?? "لايوجد"}</p>
            <p className="mt-1 text-xs font-bold text-[#607086]">{quantityLabel(task)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkSection({ title, tasks, mode, page }: { title: string; tasks: PlannedTask[]; mode: "inspection" | "greasing" | "material"; page: number }) {
  return (
    <section className="rounded-lg border border-[#e2e8ef] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-black text-[#324155]">{title}</h4>
        <StatusBadge tone="neutral">{tasks.length.toLocaleString("ar-EG")}</StatusBadge>
      </div>
      <div className="grid gap-2">
        {tasks.map((task, index) => (
          <div key={task.id} className="grid gap-2 rounded-lg border border-[#dbe3ea] bg-[#fbfcfd] p-3 sm:grid-cols-[1fr_0.8fr_0.8fr_auto] sm:items-center">
            <Info label={mode === "greasing" ? "الجزء" : "نقطة/جزء العمل"} value={partLabel(task, index)} />
            <Info label={mode === "greasing" ? "عدد النقاط" : "المادة"} value={mode === "greasing" ? valueText(task.maintenance_points?.point_name) || "لايوجد" : task.materials?.name ?? "لايوجد"} />
            <Info label="الكمية" value={quantityLabel(task)} />
            <Link
              href={`/admin/planned-tasks/${task.id}/edit?page=${page}`}
              className="rounded-lg border border-[#0b559f] px-3 py-2 text-center text-xs font-black text-[#0b559f] transition hover:bg-[#eef6ff]"
            >
              تعديل
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-[#172033]">{value}</p>
    </div>
  );
}

function CountBadge({ label, count }: { label: string; count: number }) {
  return (
    <span className="rounded-lg border border-[#dbe3ea] bg-white px-3 py-2 text-sm font-black text-[#324155]">
      {label}: {count.toLocaleString("ar-EG")}
    </span>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: ReactNode }) {
  if (disabled) {
    return <span className="rounded-lg border border-[#dbe3ea] px-4 py-2 text-sm font-black text-[#9aa7b5]">{children}</span>;
  }

  return (
    <Link href={href} className="rounded-lg border border-[#0b559f] bg-white px-4 py-2 text-sm font-black text-[#0b559f] transition hover:bg-[#eef6ff]">
      {children}
    </Link>
  );
}

function groupByEquipment(tasks: PlannedTask[]): EquipmentTaskGroup[] {
  const groups = new Map<string, PlannedTask[]>();

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

function groupNonExecutionReports(reports: NonExecutionReport[], areaId: string | null): NonExecutionGroup[] {
  const groups = new Map<string, NonExecutionReport[]>();

  for (const report of reports) {
    const task = report.planned_tasks;
    if (!task?.id) continue;
    if (areaId && task.equipment?.area_id !== areaId) continue;
    const key = [task.scheduled_date, physicalEquipmentKey(task.equipment)].join("|");
    groups.set(key, [...(groups.get(key) ?? []), report]);
  }

  return Array.from(groups.entries()).map(([id, groupReports]) => ({
    id,
    scheduledDate: groupReports[0]?.planned_tasks?.scheduled_date ?? "",
    equipment: groupReports[0]?.planned_tasks?.equipment ?? null,
    reports: groupReports,
  }));
}

function tasksByType(tasks: PlannedTask[]) {
  const grouped: Record<string, PlannedTask[]> = {};
  for (const task of tasks) {
    const key = task.maintenance_work_types?.code ?? "unknown";
    grouped[key] = [...(grouped[key] ?? []), task];
  }
  return grouped;
}

function physicalEquipmentKey(equipment: { area_id: string | null; equipment_code: string } | null) {
  return [equipment?.area_id ?? "unknown-area", normalizeKey(equipment?.equipment_code ?? "unknown-equipment")].join("|");
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function workTypeRank(task: PlannedTask) {
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

function executionTone(value?: string | null) {
  if (value === "shutdown") return "danger";
  if (value === "running") return "success";
  return "neutral";
}

function executionCondition(task: PlannedTask) {
  return task.execution_condition ?? task.maintenance_points?.execution_condition;
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function pointValues(task: PlannedTask) {
  return task.maintenance_points?.original_values ?? task.original_values ?? {};
}

function lineLabel(task: PlannedTask) {
  const value = task.equipment?.production_lines?.line_code ?? valueText(pointValues(task).line_code);
  return value || "لايوجد";
}

function lastExecutionLabel(task: PlannedTask) {
  const value = valueText(task.original_values?.previous_scheduled_date) || valueText(pointValues(task).previous_scheduled_date);
  return value || "لايوجد";
}

function frequencyLabel(task: PlannedTask) {
  const point = task.maintenance_points;
  const days = point?.frequency_days ?? valueText(pointValues(task).frequency_days);
  const hours = point?.frequency_hours ?? valueText(pointValues(task).frequency_hours);
  if (days) return `${days} يوم`;
  if (hours) return `${hours} ساعة`;
  return "لايوجد";
}

function runningHoursLabel(task: PlannedTask) {
  const value = task.maintenance_points?.running_hours_per_day ?? valueText(pointValues(task).running_hours_per_day);
  return String(value || "لايوجد");
}

function partLabel(task: PlannedTask, index: number) {
  return task.maintenance_points?.part_description?.trim() || task.maintenance_points?.point_name || `بند ${index + 1}`;
}

function quantityLabel(task: PlannedTask) {
  const unit = task.planned_quantity_unit || task.materials?.unit || "";
  if (typeof task.planned_quantity !== "number") return unit ? `0 ${unit}` : "0";
  return `${task.planned_quantity.toLocaleString("en-US")} ${unit}`;
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

function orderAreaTabs(areas: AreaTab[]) {
  return [...areas].sort((a, b) => areaTabCodes.indexOf(a.code) - areaTabCodes.indexOf(b.code));
}

function plannedTasksHref(date: string, areaCode: string | null, page?: number) {
  const params = new URLSearchParams({ date });
  if (areaCode) params.set("area", areaCode);
  if (page && page > 1) params.set("page", String(page));
  return `/admin/planned-tasks?${params.toString()}`;
}

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
}
