import { completeMaintenancePointDataAction } from "@/app/auth/actions";
import { AppShell, ContentCard, NavButton, PageHeader, StatusBadge } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { InputHTMLAttributes } from "react";

type Point = {
  id: string;
  point_name: string | null;
  execution_condition: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  running_hours_per_day: number | null;
  frequency_days: number | null;
  frequency_hours: number | null;
  last_change_date: string | null;
  last_inspection_date: string | null;
  last_grease_date: string | null;
  material_id: string | null;
  original_values: Record<string, unknown> | null;
  equipment: {
    equipment_code: string;
    name: string | null;
    areas: { name: string | null } | null;
    production_lines: { line_code: string | null; name: string | null } | null;
  } | null;
  maintenance_work_types: { code: string | null; name: string | null } | null;
};

type Material = { id: string; name: string; unit: string | null };

export default async function DataCompletionEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const [{ data: point }, { data: materials }] = await Promise.all([
    supabase
      .from("maintenance_points")
      .select(
        "id,point_name,execution_condition,quantity,quantity_unit,running_hours_per_day,frequency_days,frequency_hours,last_change_date,last_inspection_date,last_grease_date,material_id,original_values,equipment(equipment_code,name,areas(name),production_lines(line_code,name)),maintenance_work_types(code,name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("materials").select("id,name,unit").eq("is_active", true).order("name"),
  ]);

  if (!point) notFound();

  const row = point as unknown as Point;
  const values = row.original_values ?? {};
  const lastDate = row.last_inspection_date ?? row.last_grease_date ?? row.last_change_date ?? text(values.last_date);
  const materialOptions = (materials ?? []) as Material[];

  return (
    <AppShell actions={<NavButton href="/admin/data-completion" variant="secondary">العودة للبيانات</NavButton>}>
      <PageHeader
        eyebrow="استكمال البيانات"
        title={`${row.equipment?.equipment_code ?? "-"} - ${row.equipment?.name ?? "معدة بدون اسم"}`}
        description="استكمل بيانات الحساب الأساسية حتى يتم إدراج هذه النقطة في خطة الصيانة."
        action={<StatusBadge tone="warning">{workTypeLabel(row.maintenance_work_types?.code)}</StatusBadge>}
      />

      <ContentCard>
        <form action={completeMaintenancePointDataAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="point_id" value={row.id} />
          <input type="hidden" name="return_to" value={`/admin/data-completion/${row.id}/edit`} />

          <ReadOnly label="المعدة" value={`${row.equipment?.equipment_code ?? "-"} - ${row.equipment?.name ?? "معدة بدون اسم"}`} />
          <ReadOnly label="المنطقة" value={row.equipment?.areas?.name ?? "-"} />
          <Field name="point_name" label="نقطة العمل" defaultValue={row.point_name ?? ""} />
          <Field name="line_code" label="رقم الخط" defaultValue={row.equipment?.production_lines?.line_code ?? text(values.line_code)} />
          <Field name="last_date" type="date" label="آخر تاريخ" defaultValue={lastDate} required />
          <Field name="running_hours_per_day" type="number" step="0.01" label="ساعات التشغيل اليومية" defaultValue={numberValue(row.running_hours_per_day, values.running_hours_per_day)} required />
          <Field name="frequency_days" type="number" step="0.01" label="التكرار بالأيام" defaultValue={numberValue(row.frequency_days, values.frequency_days)} />
          <Field name="frequency_hours" type="number" step="0.01" label="التكرار بالساعات" defaultValue={numberValue(row.frequency_hours, values.frequency_hours)} />

          <label className="block text-sm font-black text-[#324155]">
            المادة
            <select
              name="material_id"
              defaultValue={row.material_id ?? ""}
              className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none transition focus:border-[#0b559f] focus:ring-4 focus:ring-[#0b559f]/10"
            >
              <option value="">اختر المادة</option>
              {materialOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-black text-[#324155]">
            طريقة التنفيذ
            <select
              name="execution_condition"
              defaultValue={row.execution_condition ?? "configurable"}
              className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none transition focus:border-[#0b559f] focus:ring-4 focus:ring-[#0b559f]/10"
            >
              <option value="running">أثناء العمل</option>
              <option value="shutdown">أثناء التوقف</option>
              <option value="configurable">حسب طبيعة المهمة</option>
            </select>
          </label>

          <Field name="quantity" type="number" step="0.01" label="الكمية" defaultValue={numberValue(row.quantity, values.quantity)} />
          <Field name="quantity_unit" label="وحدة الكمية" defaultValue={row.quantity_unit ?? text(values.quantity_unit)} />

          <div className="flex gap-2 md:col-span-2">
            <SubmitButton className="px-5" pendingText="جاري الحفظ">حفظ وتحديث الخطة</SubmitButton>
            <Link href="/admin/data-completion" className="rounded-lg border border-[#cbd7e3] px-5 py-3 text-sm font-black text-[#324155] transition hover:-translate-y-0.5 hover:border-[#0b559f] hover:text-[#0b559f] hover:shadow-md active:translate-y-0">
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

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-3">
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 text-sm font-bold text-[#172033]">{value}</p>
    </div>
  );
}

function workTypeLabel(value?: string | null) {
  if (value === "inspection") return "فحص";
  if (value === "greasing") return "إضافة شحم";
  if (value === "oil_change") return "تغيير زيت";
  if (value === "grease_change") return "تغيير شحم";
  return "عملية صيانة";
}

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function numberValue(value: number | null | undefined, fallback: unknown) {
  if (value !== null && value !== undefined) return String(value);
  return text(fallback);
}
