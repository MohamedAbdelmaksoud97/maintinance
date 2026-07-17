import { AppShell, ContentCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { BarChart3, CalendarDays, FileSpreadsheet, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export default function ReportsLoading() {
  return (
    <AppShell
      actions={
        <div className="inline-flex items-center gap-2 rounded-lg bg-[#0b559f] px-3.5 py-2 text-sm font-extrabold text-white opacity-80 shadow-sm">
          <Loader2 size={17} className="animate-spin" />
          تجهيز التقرير
        </div>
      }
    >
      <PageHeader
        eyebrow="التقارير"
        title="جاري حساب الخطة السنوية"
        description="يتم توليد أيام السنة بالكامل وتجميع المعدات والأعمال الداخلية بنفس قواعد خطة الصيانة."
        action={<StatusBadge tone="neutral">لحظات</StatusBadge>}
      />

      <ContentCard>
        <div className="grid gap-3 md:grid-cols-[160px_1fr_auto] md:items-end">
          <SkeletonField label="السنة" />
          <SkeletonField label="المنطقة" wide />
          <div className="h-11 animate-pulse rounded-lg bg-[#e8eef4]" />
        </div>
      </ContentCard>

      <section className="my-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LoadingMetric icon={<CalendarDays size={20} />} label="أيام السنة" />
        <LoadingMetric icon={<BarChart3 size={20} />} label="أيام بها شغل" />
        <LoadingMetric icon={<FileSpreadsheet size={20} />} label="معدات مطلوبة" />
        <LoadingMetric icon={<Loader2 size={20} className="animate-spin" />} label="أعمال داخلية" />
      </section>

      <ContentCard>
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#e2e8ef] pb-4">
          <div>
            <div className="h-5 w-40 animate-pulse rounded-full bg-[#dbe8f6]" />
            <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded-full bg-[#e8eef4]" />
          </div>
          <div className="h-8 w-28 animate-pulse rounded-md bg-[#eef6ff]" />
        </div>

        <div className="overflow-hidden rounded-lg border border-[#edf1f5]">
          <div className="grid grid-cols-8 gap-px bg-[#edf1f5]">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-12 bg-[#f8fafc] p-3">
                <div className="h-3 animate-pulse rounded-full bg-[#dbe8f6]" />
              </div>
            ))}
          </div>
          <div className="grid gap-px bg-[#edf1f5]">
            {Array.from({ length: 10 }).map((_, row) => (
              <div key={row} className="grid grid-cols-8 gap-px">
                {Array.from({ length: 8 }).map((__, cell) => (
                  <div key={cell} className="h-12 bg-white p-3">
                    <div
                      className="h-3 animate-pulse rounded-full bg-[#eef2f6]"
                      style={{ width: `${cell === 0 ? 72 : 34 + ((row + cell) % 4) * 12}%` }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </ContentCard>
    </AppShell>
  );
}

function SkeletonField({ label, wide = false }: { label: string; wide?: boolean }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-black text-[#607086]">{label}</span>
      <div className={`h-11 animate-pulse rounded-lg bg-[#eef2f6] ${wide ? "w-full" : ""}`} />
    </div>
  );
}

function LoadingMetric({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-[#dbe3ea] bg-white p-4 shadow-sm">
      <div className="inline-flex h-11 min-w-16 items-center justify-center rounded-md bg-[#eef6ff] px-3 text-[#0b559f]">
        {icon}
      </div>
      <div className="mt-4 h-7 w-24 animate-pulse rounded-full bg-[#dbe8f6]" />
      <p className="mt-3 text-sm font-bold text-[#607086]">{label}</p>
    </div>
  );
}
