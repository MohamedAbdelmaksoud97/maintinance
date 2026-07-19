import { ExportExcelButton } from "@/app/admin/reports/export-button";
import { AppShell, ContentCard, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import {
  buildAnnualMaintenanceReport,
  executionConditionLabel,
  loadAnnualReportLiveStatus,
  type AnnualReportLiveStatus,
  type AnnualReportSummary,
  type SupabaseLike,
} from "@/utils/annual-maintenance-report";
import { getSaudiToday } from "@/utils/operational-time";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { Activity, CalendarDays, Clock3, Filter, Layers, PieChart, TrendingUp } from "lucide-react";
import { Suspense } from "react";
import type { ReactNode } from "react";

const workTypes = [
  { code: "inspection", label: "فحص" },
  { code: "greasing", label: "إضافة شحم" },
  { code: "oil_change", label: "تغيير زيت" },
  { code: "grease_change", label: "تغيير شحم" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; area?: string; workType?: string }>;
}) {
  const params = await searchParams;
  const currentYear = Number(getSaudiToday().slice(0, 4));
  const year = validYear(params.year) ?? currentYear;
  const selectedAreaCode = params.area?.trim() || null;
  const selectedWorkTypeCode = validWorkType(params.workType);
  const supabase = createClient(await cookies());
  const report = await buildAnnualMaintenanceReport(supabase as unknown as SupabaseLike, {
    year,
    areaCode: selectedAreaCode,
    workTypeCode: selectedWorkTypeCode,
    includeLiveStatus: false,
  });
  const selectedArea = report.areas.find((area) => area.code === selectedAreaCode) ?? null;
  const selectedWorkType = workTypes.find((type) => type.code === selectedWorkTypeCode) ?? null;
  const query = new URLSearchParams({ year: String(report.year) });
  if (selectedAreaCode) query.set("area", selectedAreaCode);
  if (selectedWorkTypeCode) query.set("workType", selectedWorkTypeCode);
  const exportHref = `/admin/reports/export?${query.toString()}`;
  const exportFilename = `annual-maintenance-plan-${report.year}${selectedAreaCode ? `-${selectedAreaCode}` : ""}${selectedWorkTypeCode ? `-${selectedWorkTypeCode}` : ""}.xlsx`;
  const busiestMonth = report.monthlySummary[0] ? [...report.monthlySummary].sort((a, b) => b.internalTaskCount - a.internalTaskCount)[0] : null;
  const busiestArea = report.areaSummary[0] ?? null;

  return (
    <AppShell actions={<ExportExcelButton href={exportHref} filename={exportFilename} />}>
      <PageHeader
        eyebrow="التقارير"
        title="تقرير الخطة السنوية للصيانة"
        description="تقرير رسمي يتم توليده من معطيات النظام الحالية لحظة فتح الصفحة، مع مؤشرات متابعة التنفيذ المتاحة."
        action={<StatusBadge tone="neutral">{report.year}</StatusBadge>}
      />

      <section className="mb-5 rounded-lg border border-[#dbe3ea] bg-white p-5 shadow-sm">
        <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr] xl:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="success">تقرير إداري</StatusBadge>
              <StatusBadge>{selectedArea ? selectedArea.name : "كل المناطق"}</StatusBadge>
              <StatusBadge tone="neutral">{selectedWorkType ? selectedWorkType.label : "كل أنواع العمل"}</StatusBadge>
            </div>
            <h2 className="mt-4 text-2xl font-black text-[#172033]">الخطة السنوية الافتراضية ومؤشرات المتابعة</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-[#607086]">
              مبني على نقاط الصيانة النشطة وساعات التشغيل وفترات التوقف المسجلة. الحالة الحالية تظهر كمتابعة ولا تغير حساب الخطة السنوية الافتراضية.
            </p>
          </div>
          <div className="grid gap-3 rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-4">
            <ReportInfo label="تاريخ التوليد" value={formatDateTime(report.generatedAt)} />
            <ReportInfo label="نطاق التقرير" value={`${report.year}-01-01 إلى ${report.year}-12-31`} />
            <ReportInfo label="مصدر الحساب" value="المعطيات الحالية في النظام" />
          </div>
        </div>
      </section>

      <ContentCard>
        <form className="grid gap-3 xl:grid-cols-[150px_1fr_1fr_auto] xl:items-end">
          <FieldLabel label="السنة">
            <input
              name="year"
              type="number"
              min="2020"
              max="2100"
              defaultValue={report.year}
              className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-bold outline-none transition focus:border-[#0b559f] focus:ring-2 focus:ring-[#0b559f]/15"
            />
          </FieldLabel>

          <FieldLabel label="المنطقة">
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
          </FieldLabel>

          <FieldLabel label="نوع العمل">
            <select
              name="workType"
              defaultValue={selectedWorkTypeCode ?? ""}
              className="rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-bold outline-none transition focus:border-[#0b559f] focus:ring-2 focus:ring-[#0b559f]/15"
            >
              <option value="">كل أنواع العمل</option>
              {workTypes.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.label}
                </option>
              ))}
            </select>
          </FieldLabel>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#cbd7e3] bg-white px-3.5 py-2.5 text-sm font-extrabold text-[#324155] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#0b559f] hover:text-[#0b559f] hover:shadow-md active:translate-y-0"
          >
            <Filter size={17} />
            تطبيق الفلتر
          </button>
        </form>
      </ContentCard>

      <nav className="my-5 flex gap-2 overflow-x-auto rounded-lg border border-[#dbe3ea] bg-white p-2 shadow-sm" aria-label="أقسام تقرير الخطة السنوية">
        <TabLink href="#executive">Executive Summary</TabLink>
        <TabLink href="#monthly">Monthly Plan</TabLink>
        <TabLink href="#daily">Daily Plan</TabLink>
        <TabLink href="#details">Task Details</TabLink>
        <TabLink href="#live">Live Status</TabLink>
      </nav>

      <section id="executive" className="scroll-mt-4">
        <SectionTitle icon={<PieChart size={20} />} title="Executive Summary" subtitle="ملخص تنفيذي سريع مناسب للعرض الإداري." />
        <div className="my-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="أيام السنة" value={report.totals.daysInYear} />
          <MetricCard label="أيام بها أعمال" value={report.totals.workingDays} tone="success" />
          <MetricCard label="إجمالي ظهور المعدات خلال السنة" value={report.totals.equipmentCount} tone="warning" />
          <MetricCard label="أعمال داخلية" value={report.totals.internalTaskCount} />
        </div>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="فحص" value={report.totals.inspectionCount} />
          <MetricCard label="إضافة شحم" value={report.totals.greasingCount} />
          <MetricCard label="تغيير زيت" value={report.totals.oilChangeCount} />
          <MetricCard label="تغيير شحم" value={report.totals.greaseChangeCount} />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <InsightCard icon={<TrendingUp size={19} />} label="أكثر شهر تحميلًا" value={busiestMonth ? busiestMonth.label : "لايوجد"} detail={`${formatCount(busiestMonth?.internalTaskCount ?? 0)} أعمال داخلية`} />
          <InsightCard icon={<Layers size={19} />} label="أكثر منطقة تحميلًا" value={busiestArea ? busiestArea.label : "لايوجد"} detail={`${formatCount(busiestArea?.internalTaskCount ?? 0)} أعمال داخلية`} />
          <InsightCard icon={<Activity size={19} />} label="مؤشرات التنفيذ الحالية" value="تتحمل منفصلة" detail="لا تعطل عرض الخطة السنوية" />
        </div>
      </section>

      <section id="monthly" className="mt-6 scroll-mt-4">
        <SectionTitle icon={<CalendarDays size={20} />} title="Monthly Plan" subtitle="توزيع الحمل السنوي شهريًا حسب المعدات والأعمال الداخلية." />
        <SummaryTable rows={report.monthlySummary} firstColumnLabel="الشهر" />
      </section>

      <section className="mt-6">
        <SectionTitle icon={<Layers size={20} />} title="Area Load" subtitle="توزيع الأعمال حسب مناطق المصنع." />
        <SummaryTable rows={report.areaSummary} firstColumnLabel="المنطقة" />
      </section>

      <section id="daily" className="mt-6 scroll-mt-4">
        <SectionTitle icon={<CalendarDays size={20} />} title="Daily Plan" subtitle="كل أيام السنة ظاهرة، والأيام بدون أعمال تظهر بقيمة 0." />
        <ContentCard>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-separate border-spacing-0 text-right text-sm">
              <thead>
                <tr className="text-xs font-black text-[#607086]">
                  <HeaderCell>التاريخ</HeaderCell>
                  <HeaderCell>اليوم</HeaderCell>
                  <HeaderCell>ظهور المعدات</HeaderCell>
                  <HeaderCell>أعمال داخلية</HeaderCell>
                  <HeaderCell>فحص</HeaderCell>
                  <HeaderCell>إضافة شحم</HeaderCell>
                  <HeaderCell>تغيير زيت</HeaderCell>
                  <HeaderCell>تغيير شحم</HeaderCell>
                </tr>
              </thead>
              <tbody>
                {report.days.map((day) => (
                  <tr key={day.date} className={dayLoadClass(day.internalTaskCount, report.days)}>
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
      </section>

      <section id="details" className="mt-6 scroll-mt-4">
        <SectionTitle icon={<Layers size={20} />} title="Task Details" subtitle="معاينة تفصيلية للأعمال الداخلية. ملف Excel يحتوي التفاصيل الكاملة." />
        <ContentCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <StatusBadge tone="neutral">{formatCount(report.details.length)} بند تفصيلي</StatusBadge>
            <StatusBadge tone="success">يعرض أول {formatCount(Math.min(120, report.details.length))}</StatusBadge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-separate border-spacing-0 text-right text-sm">
              <thead>
                <tr className="text-xs font-black text-[#607086]">
                  <HeaderCell>التاريخ</HeaderCell>
                  <HeaderCell>المنطقة</HeaderCell>
                  <HeaderCell>المعدة</HeaderCell>
                  <HeaderCell>نوع العمل</HeaderCell>
                  <HeaderCell>الجزء</HeaderCell>
                  <HeaderCell>المادة</HeaderCell>
                  <HeaderCell>الكمية</HeaderCell>
                  <HeaderCell>شرط التنفيذ</HeaderCell>
                </tr>
              </thead>
              <tbody>
                {report.details.slice(0, 120).map((detail, index) => (
                  <tr key={`${detail.date}-${detail.equipmentCode}-${detail.workTypeCode}-${index}`} className="bg-white">
                    <BodyCell strong>{detail.date}</BodyCell>
                    <BodyCell>{detail.areaName}</BodyCell>
                    <BodyCell>{detail.equipmentCode} - {detail.equipmentName}</BodyCell>
                    <BodyCell>{detail.workTypeName}</BodyCell>
                    <BodyCell>{detail.partDescription}</BodyCell>
                    <BodyCell>{detail.materialName}</BodyCell>
                    <BodyCell>{quantityLabel(detail.quantity, detail.quantityUnit)}</BodyCell>
                    <BodyCell>{executionConditionLabel(detail.executionCondition)}</BodyCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ContentCard>
      </section>

      <section id="live" className="mt-6 scroll-mt-4">
        <SectionTitle icon={<Clock3 size={20} />} title="Live Status" subtitle="مؤشرات من المهام الحالية، ولا تؤثر على حساب الخطة الافتراضية." />
        <Suspense fallback={<LiveStatusLoading />}>
          <LiveStatusPanel year={report.year} areaCode={selectedAreaCode} workTypeCode={selectedWorkTypeCode} />
        </Suspense>
      </section>
    </AppShell>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#eef6ff] text-[#0b559f]">{icon}</div>
        <div>
          <h2 className="text-xl font-black text-[#172033]">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-[#607086]">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function SummaryTable({ rows, firstColumnLabel }: { rows: AnnualReportSummary[]; firstColumnLabel: string }) {
  return (
    <ContentCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-right text-sm">
          <thead>
            <tr className="text-xs font-black text-[#607086]">
              <HeaderCell>{firstColumnLabel}</HeaderCell>
              <HeaderCell>ظهور المعدات</HeaderCell>
              <HeaderCell>أعمال داخلية</HeaderCell>
              <HeaderCell>فحص</HeaderCell>
              <HeaderCell>إضافة شحم</HeaderCell>
              <HeaderCell>تغيير زيت</HeaderCell>
              <HeaderCell>تغيير شحم</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="bg-white">
                <BodyCell strong>{row.label}</BodyCell>
                <BodyCell>{formatCount(row.equipmentCount)}</BodyCell>
                <BodyCell>{formatCount(row.internalTaskCount)}</BodyCell>
                <BodyCell>{formatCount(row.inspectionCount)}</BodyCell>
                <BodyCell>{formatCount(row.greasingCount)}</BodyCell>
                <BodyCell>{formatCount(row.oilChangeCount)}</BodyCell>
                <BodyCell>{formatCount(row.greaseChangeCount)}</BodyCell>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <BodyCell>لايوجد</BodyCell>
                <BodyCell>0</BodyCell>
                <BodyCell>0</BodyCell>
                <BodyCell>0</BodyCell>
                <BodyCell>0</BodyCell>
                <BodyCell>0</BodyCell>
                <BodyCell>0</BodyCell>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ContentCard>
  );
}

async function LiveStatusPanel({ year, areaCode, workTypeCode }: { year: number; areaCode: string | null; workTypeCode: string | null }) {
  const supabase = createClient(await cookies());
  let rows: AnnualReportLiveStatus[] = [];
  try {
    rows = await loadAnnualReportLiveStatus(supabase as unknown as SupabaseLike, { year, areaCode, workTypeCode });
  } catch {
    return (
      <ContentCard>
        <p className="text-sm font-bold text-[#607086]">تعذر تحميل مؤشرات الحالة الحالية الآن، لكن الخطة السنوية الأساسية تم توليدها بنجاح.</p>
      </ContentCard>
    );
  }
  const totals = rows.reduce(
    (counts, row) => {
      counts[row.statusCode] += 1;
      return counts;
    },
    { planned: 0, completed: 0, overdue: 0, not_executed: 0, rescheduled: 0 },
  );

  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="مخطط" value={totals.planned} />
        <MetricCard label="مكتمل" value={totals.completed} tone="success" />
        <MetricCard label="متأخر" value={totals.overdue} tone="danger" />
        <MetricCard label="غير منفذ" value={totals.not_executed} tone="warning" />
        <MetricCard label="معاد جدولته" value={totals.rescheduled} />
      </div>
      <ContentCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-separate border-spacing-0 text-right text-sm">
            <thead>
              <tr className="text-xs font-black text-[#607086]">
                <HeaderCell>التاريخ</HeaderCell>
                <HeaderCell>الحالة</HeaderCell>
                <HeaderCell>المنطقة</HeaderCell>
                <HeaderCell>المعدة</HeaderCell>
                <HeaderCell>نوع العمل</HeaderCell>
                <HeaderCell>سبب عدم التنفيذ</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 120).map((row) => (
                <tr key={row.taskId} className="bg-white">
                  <BodyCell strong>{row.scheduledDate}</BodyCell>
                  <BodyCell><StatusBadge tone={statusTone(row.statusCode)}>{row.statusLabel}</StatusBadge></BodyCell>
                  <BodyCell>{row.areaName}</BodyCell>
                  <BodyCell>{row.equipmentCode} - {row.equipmentName}</BodyCell>
                  <BodyCell>{row.workTypeName}</BodyCell>
                  <BodyCell>{row.reason}</BodyCell>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <BodyCell>لايوجد</BodyCell>
                  <BodyCell>لايوجد</BodyCell>
                  <BodyCell>لايوجد</BodyCell>
                  <BodyCell>لايوجد</BodyCell>
                  <BodyCell>لايوجد</BodyCell>
                  <BodyCell>لايوجد</BodyCell>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ContentCard>
    </>
  );
}

function LiveStatusLoading() {
  return (
    <ContentCard>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {["مخطط", "مكتمل", "متأخر", "غير منفذ", "معاد جدولته"].map((label) => (
          <div key={label} className="rounded-lg border border-[#dbe3ea] bg-[#fbfcfd] p-4">
            <div className="h-6 w-16 animate-pulse rounded-full bg-[#dbe8f6]" />
            <p className="mt-3 text-sm font-bold text-[#607086]">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm font-bold text-[#607086]">جاري تحميل مؤشرات الحالة الحالية دون تعطيل التقرير السنوي...</p>
    </ContentCard>
  );
}

function HeaderCell({ children }: { children: ReactNode }) {
  return <th className="border-b border-[#dbe3ea] bg-[#f8fafc] px-3 py-3 first:rounded-r-lg last:rounded-l-lg">{children}</th>;
}

function BodyCell({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <td className={`border-b border-[#edf1f5] px-3 py-3 align-top ${strong ? "font-black text-[#172033]" : "font-bold text-[#516173]"}`}>
      {children}
    </td>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-black text-[#607086]">{label}</span>
      {children}
    </label>
  );
}

function TabLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="shrink-0 rounded-lg border border-[#dbe3ea] bg-white px-4 py-2 text-sm font-black text-[#324155] transition hover:border-[#0b559f] hover:text-[#0b559f]">
      {children}
    </a>
  );
}

function InsightCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-[#dbe3ea] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[#0b559f]">
        {icon}
        <p className="text-xs font-black text-[#607086]">{label}</p>
      </div>
      <p className="mt-3 text-lg font-black text-[#172033]">{value}</p>
      <p className="mt-1 text-sm font-bold text-[#607086]">{detail}</p>
    </div>
  );
}

function ReportInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 text-sm font-bold text-[#172033]">{value}</p>
    </div>
  );
}

function dayLoadClass(count: number, days: Array<{ internalTaskCount: number }>) {
  if (!count) return "bg-[#fbfcfd]";
  const max = Math.max(...days.map((day) => day.internalTaskCount), 1);
  if (count >= max * 0.75) return "bg-[#fff8ed]";
  if (count >= max * 0.45) return "bg-[#f5fbff]";
  return "bg-white";
}

function statusTone(status: string) {
  if (status === "completed") return "success";
  if (status === "overdue") return "danger";
  if (status === "not_executed") return "warning";
  return "neutral";
}

function validYear(value?: string) {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return null;
  return year;
}

function validWorkType(value?: string) {
  return value && workTypes.some((type) => type.code === value) ? value : null;
}

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function quantityLabel(quantity: number | null, unit: string) {
  return `${quantity ?? 0} ${unit && unit !== "لايوجد" ? unit : ""}`.trim();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
}
