import { AppShell, ContentCard, NavButton, PageHeader, StatusBadge } from "@/app/ui/shell";
import { getSaudiToday, SYSTEM_START_DATE } from "@/utils/operational-time";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

type Equipment = {
  id: string;
  equipment_code: string;
  name: string | null;
  description: string | null;
  original_values: Record<string, unknown> | null;
  areas: { name: string } | null;
};

type MasterRow = {
  sheet?: string;
  row?: number;
  columns?: Record<string, unknown>;
};

type UpcomingTask = {
  id: string;
  scheduled_date: string;
  original_due_date: string | null;
  execution_condition: string | null;
  planned_quantity: number | null;
  planned_quantity_unit: string | null;
  maintenance_work_types: { code: string | null; name: string | null } | null;
  maintenance_points: { point_name: string | null } | null;
  materials: { name: string | null; unit: string | null } | null;
};

export default async function EquipmentDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { id } = await params;
  const { message } = await searchParams;
  const supabase = createClient(await cookies());
  const today = getSaudiToday();
  const visibleFrom = today > SYSTEM_START_DATE ? today : SYSTEM_START_DATE;
  const { data: oldStatus } = await supabase.from("task_statuses").select("id").eq("code", "OLD").maybeSingle();
  const { data } = await supabase
    .from("equipment")
    .select("id,equipment_code,name,description,original_values,areas(name)")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const equipment = data as unknown as Equipment;
  const { data: upcomingData } = await supabase
    .from("planned_tasks")
    .select(
      "id,scheduled_date,original_due_date,execution_condition,planned_quantity,planned_quantity_unit,maintenance_work_types(code,name),maintenance_points(point_name),materials(name,unit)",
    )
    .eq("equipment_id", equipment.id)
    .gte("scheduled_date", visibleFrom)
    .neq("status_id", oldStatus?.id ?? "00000000-0000-0000-0000-000000000000")
    .order("scheduled_date", { ascending: true })
    .order("id", { ascending: true });
  const rows = getMasterRows(equipment.original_values);
  const zone = textValue(equipment.original_values?.master_line) || "بدون مكان";
  const upcomingTasks = firstTaskByWorkType((upcomingData ?? []) as unknown as UpcomingTask[]);

  return (
    <AppShell
      actions={
        <>
          <NavButton href="/admin/equipment" variant="secondary">العودة للمعدات</NavButton>
          <NavButton href={`/admin/equipment/${equipment.id}/edit`}>تعديل المعدة</NavButton>
        </>
      }
    >
      <PageHeader
        eyebrow="تفاصيل المعدة"
        title={`${equipment.equipment_code} - ${equipment.name ?? "معدة بدون اسم"}`}
        description="بيانات المعدة ونقاط الصيانة المرتبطة بها معروضة هنا للمراجعة."
        action={<StatusBadge>{zone}</StatusBadge>}
      />

      {message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">
          {message}
        </p>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <ContentCard>
          <h2 className="text-lg font-black">البيانات الأساسية</h2>
          <div className="mt-4 grid gap-3">
            <Info label="كود المعدة" value={equipment.equipment_code} />
            <Info label="اسم المعدة" value={equipment.name ?? "-"} />
            <Info label="المكان" value={zone} />
            <Info label="الوصف" value={equipment.description ?? "-"} />
          </div>
        </ContentCard>

        <ContentCard>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black">المواعيد القادمة</h2>
            <StatusBadge>{upcomingTasks.filter(Boolean).length.toLocaleString("ar-EG")} موعد</StatusBadge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {operationOrder.map((code) => (
              <UpcomingTaskCard key={code} code={code} task={upcomingTasks.find((task) => task?.maintenance_work_types?.code === code)} />
            ))}
          </div>
        </ContentCard>

        <ContentCard>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black">نقاط الصيانة داخل المعدة</h2>
            <StatusBadge>{rows.length.toLocaleString("ar-EG")} نقطة</StatusBadge>
          </div>
          <div className="mt-4 grid gap-3">
            {rows.map((row, index) => (
              <div key={`${row.sheet}-${row.row}-${index}`} className="rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <StatusBadge>نقطة صيانة {(index + 1).toLocaleString("ar-EG")}</StatusBadge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(row.columns ?? {}).map(([key, value]) => (
                    <Info key={key} label={key} value={textValue(value) || "-"} compact />
                  ))}
                </div>
              </div>
            ))}
            {!rows.length ? <p className="text-sm font-bold text-[#607086]">لا توجد نقاط صيانة محفوظة لهذه المعدة.</p> : null}
          </div>
        </ContentCard>
      </section>
    </AppShell>
  );
}

function UpcomingTaskCard({ code, task }: { code: string; task?: UpcomingTask }) {
  return (
    <div className="rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge tone={task ? "success" : "neutral"}>{workTypeLabel(code)}</StatusBadge>
        {task ? <StatusBadge>{task.scheduled_date}</StatusBadge> : null}
      </div>
      {task ? (
        <div className="mt-4 grid gap-2">
          <Info label="نقطة العمل" value={task.maintenance_points?.point_name ?? "-"} compact />
          <Info label="المادة والكمية" value={materialValue(task)} compact />
          <Info label="طريقة التنفيذ" value={conditionLabel(task.execution_condition)} compact />
        </div>
      ) : (
        <p className="mt-4 text-sm font-bold text-[#607086]">لا يوجد موعد قادم محفوظ لهذه العملية.</p>
      )}
    </div>
  );
}

function Info({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={compact ? "rounded-lg bg-white p-3" : "rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-3"}>
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-[#172033]">{value}</p>
    </div>
  );
}

function getMasterRows(values: Equipment["original_values"]): MasterRow[] {
  const rows = values?.master_rows;
  return Array.isArray(rows) ? (rows as MasterRow[]) : [];
}

const operationOrder = ["inspection", "greasing", "grease_change", "oil_change"];

function firstTaskByWorkType(tasks: UpcomingTask[]) {
  const selected = new Map<string, UpcomingTask>();
  for (const task of tasks) {
    const code = task.maintenance_work_types?.code;
    if (code && operationOrder.includes(code) && !selected.has(code)) {
      selected.set(code, task);
    }
  }

  return operationOrder.map((code) => selected.get(code)).filter(Boolean) as UpcomingTask[];
}

function workTypeLabel(value?: string | null) {
  if (value === "inspection") return "فحص";
  if (value === "greasing") return "إضافة شحم";
  if (value === "grease_change") return "تغيير شحم";
  if (value === "oil_change") return "تغيير زيت";
  return "عملية صيانة";
}

function conditionLabel(value?: string | null) {
  if (value === "shutdown") return "أثناء التوقف";
  if (value === "running") return "أثناء العمل";
  return "حسب طبيعة المهمة";
}

function materialValue(task: UpcomingTask) {
  const name = task.materials?.name ?? "-";
  const quantity = task.planned_quantity ?? "-";
  const unit = task.planned_quantity_unit ?? task.materials?.unit ?? "";
  return `${name} · ${quantity} ${unit}`.trim();
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}
