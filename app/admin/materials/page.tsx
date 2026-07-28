import { AppShell, ContentCard, MetricCard, NavButton, PageHeader, StatusBadge } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

type MaterialStock = {
  material_id: string;
  material_kind: string;
  code: string | null;
  name: string;
  unit: string | null;
  stock_quantity: number | null;
  minimum_stock: number | null;
  reorder_level: number | null;
  stock_status: "OK" | "LOW" | "REORDER" | string;
};

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; q?: string; kind?: string }>;
}) {
  const params = await searchParams;
  const searchTerm = String(params.q ?? "").trim();
  const selectedKind = ["oil", "grease", "low"].includes(String(params.kind)) ? String(params.kind) : "all";
  const supabase = createClient(await cookies());
  const { data } = await supabase
    .from("material_stock_alerts")
    .select("material_id,material_kind,code,name,unit,stock_quantity,minimum_stock,reorder_level,stock_status")
    .order("name")
    .limit(1000);

  const materials = ((data ?? []) as MaterialStock[]).filter((material) => {
    if (selectedKind === "oil" && material.material_kind !== "oil") return false;
    if (selectedKind === "grease" && material.material_kind !== "grease") return false;
    if (selectedKind === "low" && !["LOW", "REORDER"].includes(material.stock_status)) return false;
    if (!searchTerm) return true;
    const value = `${material.code ?? ""} ${material.name}`.toLowerCase();
    return value.includes(searchTerm.toLowerCase());
  });

  const allRows = (data ?? []) as MaterialStock[];
  const oilCount = allRows.filter((item) => item.material_kind === "oil").length;
  const greaseCount = allRows.filter((item) => item.material_kind === "grease").length;
  const lowCount = allRows.filter((item) => ["LOW", "REORDER"].includes(item.stock_status)).length;

  return (
    <AppShell actions={<NavButton href="/admin/materials/new">إضافة مادة جديدة</NavButton>}>
      <PageHeader
        eyebrow="المخزون"
        title="الزيوت والشحم والمخزون"
        description="إدارة أنواع الزيوت والشحم، الرصيد الحالي، حدود التنبيه، وحركات الشراء والاستهلاك."
        action={<StatusBadge tone={lowCount ? "warning" : "success"}>{lowCount.toLocaleString("ar-EG")} تحتاج متابعة</StatusBadge>}
      />

      {params.message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">
          {params.message}
        </p>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        <MetricCard label="كل المواد" value={allRows.length} />
        <MetricCard label="زيوت" value={oilCount} tone="success" />
        <MetricCard label="شحم" value={greaseCount} />
        <MetricCard label="منخفض المخزون" value={lowCount} tone={lowCount ? "warning" : "success"} />
      </section>

      <ContentCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-black">بحث وتصفية</h2>
            <p className="mt-1 text-sm font-semibold text-[#607086]">ابحث بالكود أو الاسم، أو اعرض نوعًا محددًا من المخزون.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterLink href="/admin/materials" active={selectedKind === "all"}>الكل</FilterLink>
            <FilterLink href="/admin/materials?kind=oil" active={selectedKind === "oil"}>زيوت</FilterLink>
            <FilterLink href="/admin/materials?kind=grease" active={selectedKind === "grease"}>شحم</FilterLink>
            <FilterLink href="/admin/materials?kind=low" active={selectedKind === "low"}>منخفض</FilterLink>
          </div>
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          {selectedKind !== "all" ? <input type="hidden" name="kind" value={selectedKind} /> : null}
          <input
            name="q"
            defaultValue={searchTerm}
            placeholder="ابحث باسم المادة أو كود SAP"
            className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-3 font-semibold outline-none transition focus:border-[#0b559f] focus:ring-4 focus:ring-[#0b559f]/10"
          />
          <SubmitButton className="px-5" pendingText="جاري البحث">بحث</SubmitButton>
        </form>
      </ContentCard>

      <section className="mt-5 grid gap-3">
        {materials.map((material) => (
          <ContentCard key={material.material_id}>
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr_auto] lg:items-center">
              <div className="min-w-0">
                <StatusBadge tone={material.material_kind === "grease" ? "warning" : "neutral"}>{kindLabel(material.material_kind)}</StatusBadge>
                <Link href={`/admin/materials/${material.material_id}`} className="mt-2 block break-words text-lg font-black text-[#0b559f] hover:underline">
                  {material.name}
                </Link>
                <p className="mt-1 text-sm font-bold text-[#607086]">{material.code ?? "بدون كود"}</p>
              </div>
              <Info label="الرصيد الحالي" value={`${formatNumber(material.stock_quantity)} ${material.unit ?? ""}`} />
              <Info label="حدود المخزون" value={`أدنى: ${formatNumber(material.minimum_stock)} · طلب: ${formatNumber(material.reorder_level)}`} />
              <StatusBadge tone={stockTone(material.stock_status)}>{stockLabel(material.stock_status)}</StatusBadge>
              <Link
                href={`/admin/materials/${material.material_id}`}
                className="rounded-lg border border-[#0b559f] px-4 py-2 text-center text-sm font-black text-[#0b559f] transition hover:bg-[#eef6ff]"
              >
                التفاصيل
              </Link>
            </div>
          </ContentCard>
        ))}
        {!materials.length ? (
          <ContentCard>
            <p className="text-sm font-bold text-[#607086]">لا توجد مواد مطابقة للبحث الحالي.</p>
          </ContentCard>
        ) : null}
      </section>
    </AppShell>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={active ? "rounded-lg bg-[#0b559f] px-3.5 py-2 text-sm font-black text-white" : "rounded-lg border border-[#cbd7e3] bg-white px-3.5 py-2 text-sm font-black text-[#324155]"}
    >
      {children}
    </Link>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-[#172033]">{value}</p>
    </div>
  );
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("en-US");
}

function kindLabel(value: string) {
  return value === "grease" ? "شحم" : "زيت";
}

function stockTone(value: string): "success" | "warning" | "danger" {
  if (value === "REORDER") return "danger";
  if (value === "LOW") return "warning";
  return "success";
}

function stockLabel(value: string) {
  if (value === "REORDER") return "إعادة طلب";
  if (value === "LOW") return "منخفض";
  return "جيد";
}
