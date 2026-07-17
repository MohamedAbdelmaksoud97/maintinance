import { createPlannedTaskAction } from "@/app/auth/actions";
import { AppShell, ContentCard, NavButton, PageHeader } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import type { InputHTMLAttributes } from "react";

type Equipment = { id: string; equipment_code: string; name: string | null };
type Material = { id: string; name: string; unit: string | null };
type Worker = { id: string; full_name: string };
type WorkType = { id: string; code: string; name: string };

export default async function NewPlannedTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const supabase = createClient(await cookies());
  const [{ data: equipment }, { data: materials }, { data: workers }, { data: workTypes }] = await Promise.all([
    supabase.from("equipment").select("id,equipment_code,name").eq("is_active", true).order("equipment_code").limit(1200),
    supabase.from("materials").select("id,name,unit").eq("is_active", true).order("name"),
    supabase.from("workers").select("id,full_name").eq("is_active", true).order("full_name"),
    supabase.from("maintenance_work_types").select("id,code,name").in("code", ["inspection", "oil_change", "greasing", "grease_change"]).order("name"),
  ]);

  return (
    <AppShell actions={<NavButton href="/admin/planned-tasks" variant="secondary">العودة للخطة</NavButton>}>
      <PageHeader
        eyebrow="إضافة للخطة السنوية"
        title="إضافة مهمة جديدة"
        description="أضف مهمة جديدة إلى خطة الصيانة السنوية، ويمكنك تعيين عامل لها مباشرة أو تركها بدون عامل."
      />

      {message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">{message}</p>
      ) : null}

      <ContentCard>
        <form action={createPlannedTaskAction} className="grid gap-4 md:grid-cols-2">
          <Select label="المعدة" name="equipment_id" required options={(equipment ?? []).map((item: Equipment) => ({ value: item.id, label: `${item.equipment_code} - ${item.name ?? ""}` }))} />
          <Select label="نوع المهمة" name="work_type_id" required options={(workTypes ?? []).map((item: WorkType) => ({ value: item.id, label: workTypeLabel(item.code) }))} />
          <Field name="scheduled_date" type="date" label="اليوم" required />
          <Select label="العامل المسؤول" name="worker_id" options={(workers ?? []).map((item: Worker) => ({ value: item.id, label: item.full_name }))} />
          <Select label="المادة" name="material_id" options={(materials ?? []).map((item: Material) => ({ value: item.id, label: item.name }))} />
          <Field name="planned_quantity" type="number" step="0.01" label="الكمية" />
          <Field name="planned_quantity_unit" label="وحدة الكمية" />
          <Field name="point_name" label="نقطة العمل" />
          <div className="flex gap-2 md:col-span-2">
            <SubmitButton className="px-5" pendingText="جاري الإضافة">إضافة المهمة</SubmitButton>
            <Link href="/admin/planned-tasks" className="rounded-lg border border-[#cbd7e3] px-5 py-3 text-sm font-black text-[#324155] transition hover:-translate-y-0.5 hover:border-[#0b559f] hover:text-[#0b559f] hover:shadow-md active:translate-y-0">
              إلغاء
            </Link>
          </div>
        </form>
      </ContentCard>
    </AppShell>
  );
}

function Select({ label, name, options, required = false }: { label: string; name: string; options: { value: string; label: string }[]; required?: boolean }) {
  return (
    <label className="block text-sm font-black text-[#324155]">
      {label}
      <select name={name} required={required} className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none">
        <option value="">اختر</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
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

function workTypeLabel(value: string) {
  if (value === "inspection") return "فحص";
  if (value === "oil_change") return "تغيير زيت";
  if (value === "greasing") return "إضافة شحم";
  if (value === "grease_change") return "تغيير شحم";
  return "مهمة صيانة";
}
