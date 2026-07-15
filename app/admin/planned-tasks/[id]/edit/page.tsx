import { updatePlannedTaskAction } from "@/app/auth/actions";
import { AppShell, ContentCard, NavButton, PageHeader, StatusBadge } from "@/app/ui/shell";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { InputHTMLAttributes } from "react";

type Worker = { id: string; full_name: string };
type Task = {
  id: string;
  scheduled_date: string;
  planned_quantity: number | null;
  planned_quantity_unit: string | null;
  main_worker_id: string | null;
  equipment: { equipment_code: string; name: string | null } | null;
  maintenance_points: { point_name: string | null } | null;
};

export default async function PlannedTaskEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page = "1" } = await searchParams;
  const supabase = createClient(await cookies());
  const [{ data: task }, { data: workers }] = await Promise.all([
    supabase
      .from("planned_tasks")
      .select("id,scheduled_date,planned_quantity,planned_quantity_unit,main_worker_id,equipment(equipment_code,name),maintenance_points(point_name)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("workers").select("id,full_name").eq("is_active", true).order("full_name"),
  ]);

  if (!task) notFound();

  const currentTask = task as unknown as Task;
  const workerOptions = (workers ?? []) as Worker[];

  return (
    <AppShell actions={<NavButton href={`/admin/planned-tasks?page=${page}`} variant="secondary">العودة للخطة</NavButton>}>
      <PageHeader
        eyebrow="تعديل مهمة"
        title={`${currentTask.equipment?.equipment_code ?? "مهمة"} - ${currentTask.equipment?.name ?? ""}`}
        description="عدّل بيانات المهمة ثم احفظ التغييرات."
        action={<StatusBadge>{currentTask.scheduled_date}</StatusBadge>}
      />

      <ContentCard>
        <form action={updatePlannedTaskAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="task_id" value={currentTask.id} />
          <input type="hidden" name="page" value={page} />
          <Field name="scheduled_date" type="date" label="اليوم" defaultValue={currentTask.scheduled_date} required />
          <label className="block text-sm font-black text-[#324155]">
            العامل المسؤول
            <select
              name="worker_id"
              defaultValue={currentTask.main_worker_id ?? ""}
              className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none transition focus:border-[#0b559f] focus:ring-4 focus:ring-[#0b559f]/10"
            >
              <option value="">اختر عامل</option>
              {workerOptions.map((worker) => (
                <option key={worker.id} value={worker.id}>{worker.full_name}</option>
              ))}
            </select>
          </label>
          <Field name="point_name" label="نقطة العمل" defaultValue={currentTask.maintenance_points?.point_name ?? ""} />
          <Field name="planned_quantity" type="number" step="0.01" label="الكمية" defaultValue={currentTask.planned_quantity?.toString() ?? ""} />
          <div className="flex gap-2 md:col-span-2">
            <button className="rounded-lg bg-[#0b559f] px-5 py-3 text-sm font-black text-white shadow-sm">حفظ المهمة</button>
            <Link href={`/admin/planned-tasks?page=${page}`} className="rounded-lg border border-[#cbd7e3] px-5 py-3 text-sm font-black text-[#324155]">
              إلغاء
            </Link>
          </div>
        </form>
      </ContentCard>
    </AppShell>
  );
}

function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block text-sm font-black text-[#324155]">
      {label}
      <input
        {...props}
        className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none transition focus:border-[#0b559f] focus:ring-4 focus:ring-[#0b559f]/10"
      />
    </label>
  );
}
