import { upsertMaterialAction } from "@/app/auth/actions";
import { AppShell, ContentCard, NavButton, PageHeader } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import Link from "next/link";
import type { InputHTMLAttributes } from "react";

export default function NewMaterialPage() {
  return (
    <AppShell actions={<NavButton href="/admin/materials" variant="secondary">العودة للمخزون</NavButton>}>
      <PageHeader
        eyebrow="المخزون"
        title="إضافة مادة جديدة"
        description="أضف نوع زيت أو شحم جديد إلى إدارة المخزون، ثم أضف الكميات المشتراة من صفحة التفاصيل."
      />

      <ContentCard>
        <form action={upsertMaterialAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="return_to" value="/admin/materials" />
          <label className="block text-sm font-black text-[#324155]">
            النوع
            <select name="material_kind" defaultValue="oil" className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none">
              <option value="oil">زيت</option>
              <option value="grease">شحم</option>
            </select>
          </label>
          <Field name="code" label="كود SAP" />
          <Field name="name" label="اسم المادة" required />
          <Field name="brand" label="الشركة/العلامة" />
          <Field name="grade" label="الدرجة" />
          <Field name="unit" label="الوحدة" placeholder="L / DR / KG" />
          <Field name="minimum_stock" label="الحد الأدنى" type="number" step="0.001" />
          <Field name="reorder_level" label="حد إعادة الطلب" type="number" step="0.001" />
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <SubmitButton className="px-5" pendingText="جاري الإضافة">إضافة المادة</SubmitButton>
            <Link href="/admin/materials" className="rounded-lg border border-[#cbd7e3] px-5 py-3 text-sm font-black text-[#324155] transition hover:-translate-y-0.5 hover:border-[#0b559f] hover:text-[#0b559f] hover:shadow-md active:translate-y-0">
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
