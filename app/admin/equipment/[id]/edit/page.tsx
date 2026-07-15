import { upsertEquipmentAction } from "@/app/auth/actions";
import { AppShell, ContentCard, NavButton, PageHeader } from "@/app/ui/shell";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { InputHTMLAttributes } from "react";

type Equipment = {
  id: string;
  equipment_code: string;
  name: string | null;
  description: string | null;
  area_id: string | null;
  original_values: Record<string, unknown> | null;
};

export default async function EquipmentEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const { data } = await supabase
    .from("equipment")
    .select("id,equipment_code,name,description,area_id,original_values")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const equipment = data as Equipment;
  const zone = typeof equipment.original_values?.master_line === "string" ? equipment.original_values.master_line : "بدون مكان";

  return (
    <AppShell actions={<NavButton href={`/admin/equipment/${equipment.id}`} variant="secondary">العودة للتفاصيل</NavButton>}>
      <PageHeader
        eyebrow="تعديل المعدة"
        title={`${equipment.equipment_code} - ${equipment.name ?? "معدة بدون اسم"}`}
        description="عدّل بيانات المعدة من هنا ثم احفظ التغييرات."
      />

      <ContentCard>
        <form action={upsertEquipmentAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="equipment_id" value={equipment.id} />
          <input type="hidden" name="area_id" value={equipment.area_id ?? ""} />
          <input type="hidden" name="return_to" value={`/admin/equipment/${equipment.id}`} />
          <Field name="zone" label="المكان" defaultValue={zone} required />
          <Field name="equipment_code" label="كود المعدة" defaultValue={equipment.equipment_code} required />
          <Field name="name" label="اسم المعدة" defaultValue={equipment.name ?? ""} required />
          <Field name="description" label="الوصف" defaultValue={equipment.description ?? ""} />
          <div className="flex gap-2 md:col-span-2">
            <button className="rounded-lg bg-[#0b559f] px-5 py-3 text-sm font-black text-white shadow-sm">حفظ التعديل</button>
            <Link href={`/admin/equipment/${equipment.id}`} className="rounded-lg border border-[#cbd7e3] px-5 py-3 text-sm font-black text-[#324155]">
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
