import { upsertOilAction } from "@/app/auth/actions";
import { AppShell, ContentCard, NavButton, PageHeader } from "@/app/ui/shell";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { InputHTMLAttributes } from "react";

type Oil = {
  id: string;
  code: string | null;
  name: string;
  brand: string | null;
  grade: string | null;
  unit: string | null;
  minimum_stock: number | null;
  reorder_level: number | null;
};

export default async function OilEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const { data } = await supabase
    .from("materials")
    .select("id,code,name,brand,grade,unit,minimum_stock,reorder_level")
    .eq("id", id)
    .eq("material_kind", "oil")
    .maybeSingle();

  if (!data) notFound();

  const oil = data as Oil;

  return (
    <AppShell actions={<NavButton href={`/admin/oils/${oil.id}`} variant="secondary">العودة للتفاصيل</NavButton>}>
      <PageHeader
        eyebrow="تعديل الزيت"
        title={oil.name}
        description="عدّل بيانات الزيت وحدود المخزون ثم احفظ التغييرات."
      />

      <ContentCard>
        <form action={upsertOilAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="material_id" value={oil.id} />
          <input type="hidden" name="return_to" value={`/admin/oils/${oil.id}`} />
          <Field name="code" label="الكود" defaultValue={oil.code ?? ""} />
          <Field name="name" label="اسم الزيت" defaultValue={oil.name} required />
          <Field name="brand" label="الشركة/العلامة" defaultValue={oil.brand ?? ""} />
          <Field name="grade" label="الدرجة" defaultValue={oil.grade ?? ""} />
          <Field name="unit" label="الوحدة" defaultValue={oil.unit ?? "L"} />
          <Field name="minimum_stock" label="الحد الأدنى" type="number" defaultValue={oil.minimum_stock?.toString() ?? ""} />
          <Field name="reorder_level" label="حد إعادة الطلب" type="number" defaultValue={oil.reorder_level?.toString() ?? ""} />
          <div className="flex gap-2 md:col-span-2">
            <button className="rounded-lg bg-[#0b559f] px-5 py-3 text-sm font-black text-white shadow-sm">حفظ التعديل</button>
            <Link href={`/admin/oils/${oil.id}`} className="rounded-lg border border-[#cbd7e3] px-5 py-3 text-sm font-black text-[#324155]">
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
