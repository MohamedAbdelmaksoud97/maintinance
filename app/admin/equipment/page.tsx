import { AppShell, ContentCard, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

type Equipment = {
  id: string;
  equipment_code: string;
  name: string | null;
  description: string | null;
  area_id: string | null;
  original_values: Record<string, unknown> | null;
  areas: { name: string } | null;
};

type Zone = {
  key: string;
  label: string;
  count: number;
};

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; zone?: string; q?: string }>;
}) {
  const params = await searchParams;
  const searchTerm = String(params.q ?? "").trim();
  const supabase = createClient(await cookies());
  const { data: equipment } = await supabase
    .from("equipment")
    .select("id,equipment_code,name,description,area_id,original_values,areas(name)")
    .eq("is_active", true)
    .order("equipment_code");

  const equipmentRows = ((equipment ?? []) as unknown as Equipment[]).filter((item) => isMainEquipment(item));
  const zones = buildZones(equipmentRows);
  const selectedZone = zones.some((zone) => zone.key === params.zone) ? params.zone ?? zones[0]?.key : zones[0]?.key;
  const searchedRows = searchTerm
    ? equipmentRows.filter((item) => item.equipment_code.toLowerCase().includes(searchTerm.toLowerCase()))
    : equipmentRows;
  if (searchTerm && searchedRows.length === 1) {
    redirect(`/admin/equipment/${searchedRows[0].id}`);
  }
  const visibleRows = searchedRows.filter((item) => !searchTerm ? zoneKey(item) === selectedZone : true);
  const selectedZoneLabel = zones.find((zone) => zone.key === selectedZone)?.label ?? "كل الأماكن";

  return (
    <AppShell>
      <PageHeader
        eyebrow="المعدات"
        title="إدارة المعدات الحالية"
        description="القائمة هنا مبنية على المصدر الرئيسي للمعدات، ومقسمة حسب المكان لتسهيل المراجعة والتعديل."
        action={<StatusBadge>{equipmentRows.length.toLocaleString("ar-EG")} معدة</StatusBadge>}
      />

      {params.message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">
          {params.message}
        </p>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="إجمالي المعدات" value={equipmentRows.length} />
        <MetricCard label="الأماكن" value={zones.length} />
        <MetricCard label="المكان الحالي" value={selectedZoneLabel} tone="success" />
      </section>

      <ContentCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-black">البحث عن معدة</h2>
            <p className="mt-1 text-sm font-semibold text-[#607086]">اكتب كود المعدة للوصول السريع إلى صفحتها.</p>
          </div>
          <StatusBadge tone="neutral">التعديل يتم من صفحة مستقلة</StatusBadge>
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            name="q"
            defaultValue={searchTerm}
            placeholder="مثال: 562RM1"
            className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-3 font-semibold outline-none transition focus:border-[#0b559f] focus:ring-4 focus:ring-[#0b559f]/10"
          />
          <button className="rounded-lg bg-[#0b559f] px-5 py-3 text-sm font-black text-white shadow-sm">بحث</button>
        </form>
      </ContentCard>

      <section className="mt-5 rounded-lg border border-[#dbe3ea] bg-white p-3 shadow-sm">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {zones.map((zone) => (
            <TabLink key={zone.key} active={zone.key === selectedZone} href={`/admin/equipment?zone=${encodeURIComponent(zone.key)}`}>
              {zone.label}
              <span className="rounded-md bg-white/70 px-2 py-0.5 text-xs">{zone.count.toLocaleString("ar-EG")}</span>
            </TabLink>
          ))}
        </div>
      </section>

      <section className="mt-5 grid gap-3">
        {visibleRows.map((item) => (
          <ReadEquipmentCard key={item.id} item={item} zoneKeyValue={selectedZone ?? ""} />
        ))}
        {!visibleRows.length ? (
          <ContentCard>
            <p className="text-sm font-bold text-[#607086]">لا توجد معدات مطابقة للبحث الحالي.</p>
          </ContentCard>
        ) : null}
      </section>
    </AppShell>
  );
}

function ReadEquipmentCard({ item, zoneKeyValue }: { item: Equipment; zoneKeyValue: string }) {
  return (
    <ContentCard>
      <div className="grid gap-4 lg:grid-cols-[180px_1fr_1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-black text-[#607086]">كود المعدة</p>
          <Link href={`/admin/equipment/${item.id}`} className="mt-1 inline-block text-lg font-black text-[#0b559f] hover:underline">
            {item.equipment_code}
          </Link>
        </div>
        <Info label="اسم المعدة" value={item.name ?? "بدون اسم"} />
        <Info label="الوصف" value={item.description ?? "لا يوجد وصف"} />
        <Link
          href={`/admin/equipment/${item.id}/edit?zone=${encodeURIComponent(zoneKeyValue)}`}
          className="rounded-lg border border-[#0b559f] px-4 py-2 text-center text-sm font-black text-[#0b559f] transition hover:bg-[#eef6ff]"
        >
          تعديل
        </Link>
      </div>
    </ContentCard>
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

function TabLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "flex shrink-0 items-center gap-2 rounded-lg bg-[#0b559f] px-4 py-2 text-sm font-black text-white"
          : "flex shrink-0 items-center gap-2 rounded-lg border border-[#dbe3ea] bg-white px-4 py-2 text-sm font-black text-[#516173] transition hover:border-[#0b559f] hover:text-[#0b559f]"
      }
    >
      {children}
    </Link>
  );
}

function isMainEquipment(item: Equipment) {
  return item.original_values?.source_mode === "master_equipment" || item.original_values?.source_mode === "manual_equipment";
}

function zoneLabel(item: Equipment) {
  const value = item.original_values?.master_line;
  return typeof value === "string" && value.trim() ? value.trim() : "بدون مكان";
}

function zoneKey(item: Equipment) {
  return zoneLabel(item).toLowerCase();
}

function buildZones(rows: Equipment[]): Zone[] {
  const counts = new Map<string, Zone>();
  for (const item of rows) {
    const key = zoneKey(item);
    const label = zoneLabel(item);
    const current = counts.get(key);
    counts.set(key, { key, label, count: (current?.count ?? 0) + 1 });
  }

  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
}
