import { AppShell, ContentCard, NavButton, PageHeader, StatusBadge } from "@/app/ui/shell";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

type Equipment = {
  id: string;
  equipment_code: string;
  name: string | null;
  description: string | null;
  original_values: Record<string, unknown> | null;
  areas: { name: string } | null;
};

type MasterRow = {
  sheet?: string;
  row?: number;
  columns?: Record<string, unknown>;
};

export default async function EquipmentDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { id } = await params;
  const { message } = await searchParams;
  const supabase = createClient(await cookies());
  const { data } = await supabase
    .from("equipment")
    .select("id,equipment_code,name,description,original_values,areas(name)")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const equipment = data as unknown as Equipment;
  const rows = getMasterRows(equipment.original_values);
  const zone = textValue(equipment.original_values?.master_line) || "بدون مكان";

  return (
    <AppShell
      actions={
        <>
          <NavButton href="/admin/equipment" variant="secondary">العودة للمعدات</NavButton>
          <NavButton href={`/admin/equipment/${equipment.id}/edit`}>تعديل المعدة</NavButton>
        </>
      }
    >
      <PageHeader
        eyebrow="تفاصيل المعدة"
        title={`${equipment.equipment_code} - ${equipment.name ?? "معدة بدون اسم"}`}
        description="بيانات المعدة ونقاط الصيانة المرتبطة بها معروضة هنا للمراجعة."
        action={<StatusBadge>{zone}</StatusBadge>}
      />

      {message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">
          {message}
        </p>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <ContentCard>
          <h2 className="text-lg font-black">البيانات الأساسية</h2>
          <div className="mt-4 grid gap-3">
            <Info label="كود المعدة" value={equipment.equipment_code} />
            <Info label="اسم المعدة" value={equipment.name ?? "-"} />
            <Info label="المكان" value={zone} />
            <Info label="الوصف" value={equipment.description ?? "-"} />
          </div>
        </ContentCard>

        <ContentCard>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black">نقاط الصيانة داخل المعدة</h2>
            <StatusBadge>{rows.length.toLocaleString("ar-EG")} نقطة</StatusBadge>
          </div>
          <div className="mt-4 grid gap-3">
            {rows.map((row, index) => (
              <div key={`${row.sheet}-${row.row}-${index}`} className="rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <StatusBadge>نقطة صيانة {(index + 1).toLocaleString("ar-EG")}</StatusBadge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(row.columns ?? {}).map(([key, value]) => (
                    <Info key={key} label={key} value={textValue(value) || "-"} compact />
                  ))}
                </div>
              </div>
            ))}
            {!rows.length ? <p className="text-sm font-bold text-[#607086]">لا توجد نقاط صيانة محفوظة لهذه المعدة.</p> : null}
          </div>
        </ContentCard>
      </section>
    </AppShell>
  );
}

function Info({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={compact ? "rounded-lg bg-white p-3" : "rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-3"}>
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-[#172033]">{value}</p>
    </div>
  );
}

function getMasterRows(values: Equipment["original_values"]): MasterRow[] {
  const rows = values?.master_rows;
  return Array.isArray(rows) ? (rows as MasterRow[]) : [];
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}
