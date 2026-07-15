import { upsertOilAction } from "@/app/auth/actions";
import { AppShell, ContentCard, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";

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

export default async function OilsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; q?: string }>;
}) {
  const params = await searchParams;
  const searchTerm = String(params.q ?? "").trim();
  const supabase = createClient(await cookies());
  const { data } = await supabase
    .from("materials")
    .select("id,code,name,brand,grade,unit,minimum_stock,reorder_level")
    .eq("material_kind", "oil")
    .eq("is_active", true)
    .order("name")
    .limit(500);

  const oils = ((data ?? []) as Oil[]).filter((oil) => {
    if (!searchTerm) return true;
    const value = `${oil.code ?? ""} ${oil.name} ${oil.brand ?? ""} ${oil.grade ?? ""}`.toLowerCase();
    return value.includes(searchTerm.toLowerCase());
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="الزيوت"
        title="إدارة بيانات الزيت"
        description="استعراض أنواع الزيت وحدود المخزون، وكل نوع زيت له صفحة تفاصيل وتعديل مستقلة."
        action={<StatusBadge>{oils.length.toLocaleString("ar-EG")} نوع</StatusBadge>}
      />

      {params.message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">
          {params.message}
        </p>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="أنواع الزيت" value={oils.length} />
        <MetricCard label="الوحدة الأساسية" value="L" />
        <MetricCard label="طريقة التعديل" value="صفحة مستقلة" tone="success" />
      </section>

      <ContentCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-black">البحث والإضافة</h2>
            <p className="mt-1 text-sm font-semibold text-[#607086]">ابحث باسم الزيت أو الكود، أو أضف نوع زيت جديد.</p>
          </div>
          <StatusBadge tone="neutral">التعديل بعد الضغط على زر تعديل</StatusBadge>
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            name="q"
            defaultValue={searchTerm}
            placeholder="ابحث باسم الزيت أو الكود"
            className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-3 font-semibold outline-none transition focus:border-[#0b559f] focus:ring-4 focus:ring-[#0b559f]/10"
          />
          <button className="rounded-lg bg-[#0b559f] px-5 py-3 text-sm font-black text-white shadow-sm">بحث</button>
        </form>
      </ContentCard>

      <ContentCard>
        <h2 className="text-lg font-black">إضافة زيت جديد</h2>
        <form action={upsertOilAction} className="mt-4 grid gap-3 md:grid-cols-4">
          <Field name="code" label="الكود" />
          <Field name="name" label="اسم الزيت" required />
          <Field name="brand" label="الشركة/العلامة" />
          <Field name="grade" label="الدرجة" />
          <Field name="unit" label="الوحدة" defaultValue="L" />
          <Field name="minimum_stock" label="الحد الأدنى" type="number" />
          <Field name="reorder_level" label="حد إعادة الطلب" type="number" />
          <button className="self-end rounded-lg bg-[#0b559f] px-4 py-3 text-sm font-black text-white shadow-sm">
            إضافة
          </button>
        </form>
      </ContentCard>

      <section className="mt-5 grid gap-3">
        {oils.map((oil) => (
          <ContentCard key={oil.id}>
            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
              <div className="min-w-0">
                <p className="text-xs font-black text-[#607086]">نوع الزيت</p>
                <Link href={`/admin/oils/${oil.id}`} className="mt-1 inline-block text-lg font-black text-[#0b559f] hover:underline">
                  {oil.name}
                </Link>
                <p className="mt-1 text-sm font-bold text-[#607086]">{oil.code ?? "بدون كود"}</p>
              </div>
              <Info label="الشركة / الدرجة" value={`${oil.brand ?? "-"} · ${oil.grade ?? "-"}`} />
              <Info label="حدود المخزون" value={`أدنى: ${oil.minimum_stock ?? "-"} · طلب: ${oil.reorder_level ?? "-"} ${oil.unit ?? ""}`} />
              <Link
                href={`/admin/oils/${oil.id}/edit`}
                className="rounded-lg border border-[#0b559f] px-4 py-2 text-center text-sm font-black text-[#0b559f] transition hover:bg-[#eef6ff]"
              >
                تعديل
              </Link>
            </div>
          </ContentCard>
        ))}
        {!oils.length ? (
          <ContentCard>
            <p className="text-sm font-bold text-[#607086]">لا توجد زيوت مطابقة للبحث الحالي.</p>
          </ContentCard>
        ) : null}
      </section>
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

function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
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
