import { AppShell, ContentCard, MetricCard, NavButton, PageHeader, StatusBadge } from "@/app/ui/shell";
import { SYSTEM_START_DATE } from "@/utils/operational-time";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

const pageSize = 30;

type PlannedTask = {
  id: string;
  scheduled_date: string;
  planned_quantity: number | null;
  planned_quantity_unit: string | null;
  main_worker_id: string | null;
  equipment: { equipment_code: string; name: string | null } | null;
  maintenance_points: { point_name: string | null; execution_condition: string } | null;
  materials: { name: string | null } | null;
  maintenance_work_types: { code: string | null; name: string | null } | null;
};

export default async function PlannedTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; message?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const supabase = createClient(await cookies());
  const { data: oldStatus } = await supabase.from("task_statuses").select("id").eq("code", "OLD").maybeSingle();
  const oldStatusId = oldStatus?.id ?? "00000000-0000-0000-0000-000000000000";

  const [{ data: detailedData, error: detailedTasksError }, { count, error: countError }, { count: unassignedCount, error: unassignedError }] =
    await Promise.all([
    supabase
      .from("planned_tasks")
      .select(
        "id,scheduled_date,planned_quantity,planned_quantity_unit,main_worker_id,equipment(equipment_code,name),maintenance_points(point_name,execution_condition),materials(name),maintenance_work_types(code,name)",
      )
      .gte("scheduled_date", SYSTEM_START_DATE)
      .neq("status_id", oldStatusId)
      .order("scheduled_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
    supabase
      .from("planned_tasks")
      .select("id", { count: "exact", head: true })
      .gte("scheduled_date", SYSTEM_START_DATE)
      .neq("status_id", oldStatusId),
    supabase
      .from("planned_tasks")
      .select("id", { count: "exact", head: true })
      .gte("scheduled_date", SYSTEM_START_DATE)
      .neq("status_id", oldStatusId)
      .is("main_worker_id", null),
  ]);
  let taskRows: unknown[] | null = detailedData;
  let tasksError = detailedTasksError;
  if (tasksError) {
    const fallback = await supabase
      .from("planned_tasks")
      .select("id,scheduled_date,planned_quantity,planned_quantity_unit,main_worker_id")
      .gte("scheduled_date", SYSTEM_START_DATE)
      .neq("status_id", oldStatusId)
      .order("scheduled_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    taskRows = fallback.data;
    tasksError = fallback.error;
  }
  const error = tasksError;

  const tasks = (taskRows ?? []) as unknown as PlannedTask[];
  const total = countError ? tasks.length : count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AppShell actions={<NavButton href="/admin/planned-tasks/new">إضافة مهمة للخطة</NavButton>}>
      <PageHeader
        eyebrow="خطة الصيانة"
        title="مهام الخطة اليومية"
        description="المهام مرتبة حسب اليوم. التعديل يتم من صفحة مستقلة بعد الضغط على زر تعديل."
        action={<StatusBadge tone="success">بداية الخطة 15 / 07 / 2026</StatusBadge>}
      />

      {params.message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">
          {params.message}
        </p>
      ) : null}

      {error ? (
        <ContentCard>
          <p className="text-sm font-bold text-[#c1121f]">تعذر تحميل المهام الآن. أعد المحاولة بعد لحظات.</p>
        </ContentCard>
      ) : (
        <>
          <section className="mb-5 grid gap-3 sm:grid-cols-3">
            <MetricCard label="إجمالي مهام الخطة الحالية" value={total} />
            <MetricCard label="مهام بدون عامل" value={unassignedError ? 0 : unassignedCount ?? 0} tone="warning" />
            <MetricCard label="الصفحة الحالية" value={`${page.toLocaleString("ar-EG")} / ${totalPages.toLocaleString("ar-EG")}`} />
          </section>

          <ContentCard>
            <div className="mb-4 flex flex-col gap-2 border-b border-[#e2e8ef] pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black">قائمة المهام</h2>
                <p className="mt-1 text-sm font-semibold text-[#607086]">
                  عرض {(from + 1).toLocaleString("ar-EG")} - {Math.min(to + 1, total).toLocaleString("ar-EG")} من{" "}
                  {total.toLocaleString("ar-EG")}
                </p>
              </div>
              <StatusBadge tone="warning">{(unassignedError ? 0 : unassignedCount ?? 0).toLocaleString("ar-EG")} تحتاج تعيين عامل</StatusBadge>
            </div>

            <div className="grid gap-3">
              {tasks.map((task) => (
                <div key={task.id} className="rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-4">
                  <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr_1fr_auto] xl:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={task.main_worker_id ? "success" : "warning"}>
                          {task.main_worker_id ? "تم التعيين" : "تحتاج عامل"}
                        </StatusBadge>
                        <StatusBadge>{task.scheduled_date}</StatusBadge>
                        <StatusBadge tone="neutral">{workTypeLabel(task.maintenance_work_types?.code)}</StatusBadge>
                      </div>
                      <h3 className="mt-3 text-base font-black text-[#172033]">
                        {task.equipment?.equipment_code ?? "بدون كود"} - {task.equipment?.name ?? "معدة بدون اسم"}
                      </h3>
                    </div>
                    <Info label="نقطة العمل" value={task.maintenance_points?.point_name ?? "-"} />
                    <Info
                      label="المادة والكمية"
                      value={`${task.materials?.name ?? "-"} · ${task.planned_quantity ?? "-"} ${task.planned_quantity_unit ?? ""}`}
                    />
                    <Link
                      href={`/admin/planned-tasks/${task.id}/edit?page=${page}`}
                      className="rounded-lg border border-[#0b559f] px-4 py-2 text-center text-sm font-black text-[#0b559f] transition hover:bg-[#eef6ff]"
                    >
                      تعديل
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e2e8ef] pt-4">
              <PageLink disabled={page <= 1} href={`/admin/planned-tasks?page=${page - 1}`}>السابق</PageLink>
              <p className="text-sm font-bold text-[#607086]">
                صفحة {page.toLocaleString("ar-EG")} من {totalPages.toLocaleString("ar-EG")}
              </p>
              <PageLink disabled={page >= totalPages} href={`/admin/planned-tasks?page=${page + 1}`}>التالي</PageLink>
            </div>
          </ContentCard>
        </>
      )}
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-[#172033]">{value}</p>
    </div>
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

function workTypeLabel(value?: string | null) {
  if (value === "inspection") return "فحص";
  if (value === "oil_change") return "تغيير زيت";
  if (value === "greasing") return "تشحيم";
  return "مهمة صيانة";
}
