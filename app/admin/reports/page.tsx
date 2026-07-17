import { AppShell, ContentCard, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { ExportExcelButton } from "@/app/admin/reports/export-button";
import { buildAnnualMaintenanceReport, type SupabaseLike } from "@/utils/annual-maintenance-report";
import { getSaudiToday } from "@/utils/operational-time";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { Filter } from "lucide-react";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; area?: string }>;
}) {
  const params = await searchParams;
  const currentYear = Number(getSaudiToday().slice(0, 4));
  const year = validYear(params.year) ?? currentYear;
  const selectedAreaCode = params.area?.trim() || null;
  const supabase = createClient(await cookies());
  const report = await buildAnnualMaintenanceReport(supabase as unknown as SupabaseLike, { year, areaCode: selectedAreaCode });
  const selectedArea = report.areas.find((area) => area.code === selectedAreaCode) ?? null;
  const exportHref = `/admin/reports/export?year=${report.year}${selectedAreaCode ? `&area=${encodeURIComponent(selectedAreaCode)}` : ""}`;
  const exportFilename = `annual-maintenance-plan-${report.year}${selectedAreaCode ? `-${selectedAreaCode}` : ""}.xlsx`;

  return (
    <AppShell actions={<ExportExcelButton href={exportHref} filename={exportFilename} />}>
      <PageHeader
        eyebrow="التقارير"
        title="الخطة السنوية الافتراضية"
        description="عرض سنة كاملة بافتراض تنفيذ كل أعمال الصيانة في موعدها المخطط، ثم حساب المواعيد التالية بناء على ذلك."
        action={<StatusBadge tone="neutral">{report.year}</StatusBadge>}
      />

      <ContentCard>
        <form className="grid gap-3 md:grid-cols-[160px_1fr_auto] md:items-end">
          <label className="grid gap-1">
            <span className="text-xs font-black text-[#607086]">السنة</span>
            <input
              name="year"
              type="number"
              min="2020"
              max="2100"
              defaultValue={report.year}
              className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-bold outline-none transition focus:border-[#0b559f] focus:ring-2 focus:ring-[#0b559f]/15"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black text-[#607086]">المنطقة</span>
            <select
              name="area"
              defaultValue={selectedAreaCode ?? ""}
              className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-bold outline-none transition focus:border-[#0b559f] focus:ring-2 focus:ring-[#0b559f]/15"
            >
              <option value="">كل المناطق</option>
              {report.areas.map((area) => (
                <option key={area.id} value={area.code}>
                  {area.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#cbd7e3] bg-white px-3.5 py-2.5 text-sm font-extrabold text-[#324155] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#0b559f] hover:text-[#0b559f] hover:shadow-md active:translate-y-0"
          >
            <Filter size={17} />
            تطبيق الفلتر
          </button>
        </form>
      </ContentCard>

      <section className="my-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="أيام السنة" value={report.totals.daysInYear} />
        <MetricCard label="أيام بها شغل" value={report.totals.workingDays} tone="success" />
        <MetricCard label="معدات مطلوبة" value={report.totals.equipmentCount} tone="warning" />
        <MetricCard label="أعمال داخلية" value={report.totals.internalTaskCount} />
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="فحص" value={report.totals.inspectionCount} />
        <MetricCard label="إضافة شحم" value={report.totals.greasingCount} />
        <MetricCard label="تغيير زيت" value={report.totals.oilChangeCount} />
        <MetricCard label="تغيير شحم" value={report.totals.greaseChangeCount} />
      </section>

      <ContentCard>
        <div className="mb-4 flex flex-col gap-2 border-b border-[#e2e8ef] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black">ملخص أيام السنة</h2>
            <p className="mt-1 text-sm font-semibold text-[#607086]">
              {selectedArea ? selectedArea.name : "كل المناطق"} · كل يوم ظاهر حتى لو عدد المهام 0.
            </p>
          </div>
          <StatusBadge tone={report.details.length ? "success" : "warning"}>
            {formatCount(report.details.length)} بند تفصيلي في ملف Excel
          </StatusBadge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-right text-sm">
            <thead>
              <tr className="text-xs font-black text-[#607086]">
                <HeaderCell>التاريخ</HeaderCell>
                <HeaderCell>اليوم</HeaderCell>
                <HeaderCell>معدات مطلوبة</HeaderCell>
                <HeaderCell>أعمال داخلية</HeaderCell>
                <HeaderCell>فحص</HeaderCell>
                <HeaderCell>إضافة شحم</HeaderCell>
                <HeaderCell>تغيير زيت</HeaderCell>
                <HeaderCell>تغيير شحم</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {report.days.map((day) => (
                <tr key={day.date} className={day.internalTaskCount ? "bg-white" : "bg-[#fbfcfd]"}>
                  <BodyCell strong>{day.date}</BodyCell>
                  <BodyCell>{day.dayName}</BodyCell>
                  <BodyCell>{formatCount(day.equipmentCount)}</BodyCell>
                  <BodyCell>{formatCount(day.internalTaskCount)}</BodyCell>
                  <BodyCell>{formatCount(day.inspectionCount)}</BodyCell>
                  <BodyCell>{formatCount(day.greasingCount)}</BodyCell>
                  <BodyCell>{formatCount(day.oilChangeCount)}</BodyCell>
                  <BodyCell>{formatCount(day.greaseChangeCount)}</BodyCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContentCard>
    </AppShell>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-[#dbe3ea] bg-[#f8fafc] px-3 py-3 first:rounded-r-lg last:rounded-l-lg">{children}</th>;
}

function BodyCell({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <td className={`border-b border-[#edf1f5] px-3 py-3 ${strong ? "font-black text-[#172033]" : "font-bold text-[#516173]"}`}>
      {children}
    </td>
  );
}

function validYear(value?: string) {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return null;
  return year;
}

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}
