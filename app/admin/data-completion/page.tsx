import { AppShell, ContentCard, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";

type MissingPoint = {
  id: string;
  point_name: string | null;
  execution_condition: string | null;
  frequency_days: number | null;
  frequency_hours: number | null;
  running_hours_per_day: number | null;
  original_values: Record<string, unknown> | null;
  equipment: {
    equipment_code: string;
    name: string | null;
    areas: { name: string | null } | null;
    production_lines: { line_code: string | null; name: string | null } | null;
  } | null;
  maintenance_work_types: { code: string | null; name: string | null } | null;
  materials: { name: string | null } | null;
};

export default async function DataCompletionPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; area?: string; message?: string }>;
}) {
  const params = await searchParams;
  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from("maintenance_points")
    .select(
      "id,point_name,execution_condition,frequency_days,frequency_hours,running_hours_per_day,original_values,equipment(equipment_code,name,areas(name),production_lines(line_code,name)),maintenance_work_types(code,name),materials(name)",
    )
    .eq("needs_data_review", true)
    .eq("data_quality_status", "MISSING_DATA")
    .eq("original_values->>source_mode", "calculated_next_due")
    .order("updated_at", { ascending: false });

  const query = (params.q ?? "").trim().toLowerCase();
  const type = params.type ?? "";
  const area = params.area ?? "";
  const rows = ((data ?? []) as unknown as MissingPoint[]).filter((row) => {
    const matchesQuery =
      !query ||
      row.equipment?.equipment_code.toLowerCase().includes(query) ||
      (row.equipment?.name ?? "").toLowerCase().includes(query);
    const matchesType = !type || row.maintenance_work_types?.code === type;
    const matchesArea = !area || row.equipment?.areas?.name === area;
    return matchesQuery && matchesType && matchesArea;
  });
  const areas = unique((data ?? []).map((row) => ((row as unknown as MissingPoint).equipment?.areas?.name ?? "")).filter(Boolean));

  return (
    <AppShell>
      <PageHeader
        eyebrow="استكمال البيانات"
        title="بيانات تحتاج استكمال"
        description="هذه النقاط لا يمكن وضعها داخل الخطة قبل استكمال بيانات الحساب الأساسية."
      />

      {params.message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">{params.message}</p>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="إجمالي النقاط" value={data?.length ?? 0} tone={(data?.length ?? 0) > 0 ? "warning" : "success"} />
        <MetricCard label="المعروض حاليًا" value={rows.length} />
        <MetricCard label="أنواع العمليات" value={unique(((data ?? []) as unknown as MissingPoint[]).map((row) => row.maintenance_work_types?.code ?? "")).length} />
      </section>

      <ContentCard>
        <form className="mb-5 grid gap-3 border-b border-[#e2e8ef] pb-5 md:grid-cols-[1fr_220px_220px_auto]">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="بحث بكود أو اسم المعدة"
            className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-semibold outline-none transition focus:border-[#0b559f] focus:ring-4 focus:ring-[#0b559f]/10"
          />
          <select name="type" defaultValue={type} className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-semibold outline-none">
            <option value="">كل العمليات</option>
            <option value="inspection">فحص</option>
            <option value="greasing">إضافة شحم</option>
            <option value="oil_change">تغيير زيت</option>
            <option value="grease_change">تغيير شحم</option>
          </select>
          <select name="area" defaultValue={area} className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-semibold outline-none">
            <option value="">كل المناطق</option>
            {areas.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <button className="rounded-lg bg-[#0b559f] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#0a3f78]">
            تطبيق
          </button>
        </form>

        {error ? <p className="text-sm font-bold text-[#c1121f]">تعذر تحميل البيانات الآن.</p> : null}

        <div className="grid gap-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-4">
              <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr_auto] xl:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="warning">{workTypeLabel(row.maintenance_work_types?.code)}</StatusBadge>
                    <StatusBadge>{row.equipment?.areas?.name ?? "بدون منطقة"}</StatusBadge>
                    <StatusBadge>{lineLabel(row)}</StatusBadge>
                  </div>
                  <h2 className="mt-3 text-base font-black">
                    {row.equipment?.equipment_code ?? "-"} - {row.equipment?.name ?? "معدة بدون اسم"}
                  </h2>
                </div>
                <Info label="نقطة العمل" value={row.point_name ?? "-"} />
                <Info label="المطلوب" value={missingReasons(row).join("، ")} />
                <Link
                  href={`/admin/data-completion/${row.id}/edit`}
                  className="rounded-lg border border-[#0b559f] px-4 py-2 text-center text-sm font-black text-[#0b559f] transition hover:bg-[#eef6ff]"
                >
                  استكمال
                </Link>
              </div>
            </div>
          ))}
          {!rows.length ? <p className="text-sm font-bold text-[#607086]">لا توجد بيانات ناقصة حسب الفلتر الحالي.</p> : null}
        </div>
      </ContentCard>
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

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function workTypeLabel(value?: string | null) {
  if (value === "inspection") return "فحص";
  if (value === "greasing") return "إضافة شحم";
  if (value === "oil_change") return "تغيير زيت";
  if (value === "grease_change") return "تغيير شحم";
  return "عملية صيانة";
}

function lineLabel(row: MissingPoint) {
  return row.equipment?.production_lines?.line_code ?? text(row.original_values?.line_code) ?? "بدون خط";
}

function missingReasons(row: MissingPoint) {
  const values = row.original_values ?? {};
  const reasons: string[] = [];
  if (!text(values.last_date)) reasons.push("آخر تاريخ مطلوب");
  if (!row.frequency_days && !row.frequency_hours && !text(values.frequency_days) && !text(values.frequency_hours)) reasons.push("التكرار مطلوب");
  if (!row.running_hours_per_day && !text(values.running_hours_per_day)) reasons.push("ساعات التشغيل مطلوبة");
  if (!lineLabel(row) || lineLabel(row) === "بدون خط") reasons.push("رقم الخط مطلوب");
  return reasons.length ? reasons : ["استكمال البيانات الأساسية"];
}

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}
