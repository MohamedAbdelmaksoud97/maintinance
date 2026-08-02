import { signOutAction } from "@/app/auth/actions";
import { AppShell, ContentCard, MetricCard, PageHeader } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import { getDashboardSummary } from "@/utils/dashboard";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

type Tone = "neutral" | "success" | "warning" | "danger";

export default async function Page() {
  const summary = await getDashboardSummary();
  const supabase = createClient(await cookies());
  const { data: lowStockRows } = await supabase
    .from("material_stock_alerts")
    .select("material_id,material_kind,name,unit,stock_quantity,stock_status")
    .in("stock_status", ["LOW", "REORDER"])
    .order("stock_quantity", { ascending: true })
    .limit(6);
  const maxPlanValue = Math.max(summary.dueToday, summary.dueNext7Days, summary.dueNext30Days, summary.shutdownTasks, summary.urgentPlannedTasks, 1);
  const maxAssetValue = Math.max(summary.equipment, summary.materials, summary.lowStockMaterials, 1);

  return (
    <AppShell
      actions={
        <form action={signOutAction}>
          <SubmitButton variant="danger" className="px-3.5 py-2 font-extrabold" pendingText="جاري الخروج">
            خروج
          </SubmitButton>
        </form>
      }
    >
      <PageHeader eyebrow="لوحة الإحصائيات" title="مؤشرات الصيانة القادمة" />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="مستحق اليوم" value={summary.dueToday} tone={summary.dueToday > 0 ? "warning" : "success"} />
        <MetricCard label="خلال 7 أيام" value={summary.dueNext7Days} />
        <MetricCard label="مهام خطة عاجلة" value={summary.urgentPlannedTasks} tone={summary.urgentPlannedTasks > 0 ? "danger" : "success"} />
        <MetricCard label="تحتاج توقف" value={summary.shutdownTasks} tone="danger" />
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <ContentCard>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#0b559f]">الخطة القادمة</p>
              <h2 className="mt-1 text-xl font-black">توزيع الاستحقاقات</h2>
            </div>
            <p className="rounded-md bg-[#f4f7fa] px-3 py-1 text-sm font-black text-[#516173]">
              {formatNumber(summary.dueNext30Days)}
            </p>
          </div>

          <div className="mt-6 flex h-72 items-end gap-3 rounded-lg border border-[#e2e8ef] bg-[#f8fafc] p-4">
            <VerticalBar label="اليوم" value={summary.dueToday} max={maxPlanValue} tone="warning" />
            <VerticalBar label="7 أيام" value={summary.dueNext7Days} max={maxPlanValue} tone="neutral" />
            <VerticalBar label="عاجلة" value={summary.urgentPlannedTasks} max={maxPlanValue} tone="danger" />
            <VerticalBar label="توقف" value={summary.shutdownTasks} max={maxPlanValue} tone="danger" />
          </div>
        </ContentCard>

        <ContentCard>
          <div>
            <p className="text-xs font-black text-[#0b559f]">الأصول والمواد</p>
            <h2 className="mt-1 text-xl font-black">مؤشرات المخزون والمعدات</h2>
          </div>

          <div className="mt-6 grid gap-4">
            <HorizontalBar label="المعدات" value={summary.equipment} max={maxAssetValue} tone="neutral" />
            <HorizontalBar label="الزيوت والمواد" value={summary.materials} max={maxAssetValue} tone="success" />
            <HorizontalBar label="مواد تحتاج متابعة" value={summary.lowStockMaterials} max={maxAssetValue} tone="warning" />
            <HorizontalBar label="عمال بانتظار الاعتماد" value={summary.pendingWorkers} max={maxAssetValue} tone="danger" />
          </div>
        </ContentCard>
      </section>

      <section className="mt-5">
        <ContentCard>
          <div>
            <p className="text-xs font-black text-[#0b559f]">نطاق المتابعة</p>
            <h2 className="mt-1 text-xl font-black">ملخص سريع</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="مستحق اليوم" value={summary.dueToday} tone="warning" />
            <StatTile label="قادم خلال أسبوع" value={summary.dueNext7Days} tone="neutral" />
            <StatTile label="مهام خطة عاجلة" value={summary.urgentPlannedTasks} tone="danger" />
            <StatTile label="مهام أثناء التوقف" value={summary.shutdownTasks} tone="danger" />
          </div>
        </ContentCard>
      </section>

      <section className="mt-5">
        <ContentCard>
          <div>
            <p className="text-xs font-black text-[#0b559f]">المخزون الآن</p>
            <h2 className="mt-1 text-xl font-black">زيوت وشحم تحتاج متابعة</h2>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(lowStockRows ?? []).map((item) => (
              <div key={item.material_id} className="rounded-lg border border-[#e2e8ef] bg-[#f8fafc] p-4">
                <p className="text-xs font-black text-[#607086]">{item.material_kind === "grease" ? "شحم" : "زيت"}</p>
                <p className="mt-1 break-words text-sm font-black text-[#172033]">{item.name}</p>
                <p className="mt-3 text-2xl font-black text-[#a16207]">
                  {formatNumber(Number(item.stock_quantity ?? 0))} {item.unit ?? ""}
                </p>
              </div>
            ))}
            {lowStockRows?.length ? null : (
              <div className="rounded-lg border border-[#e2e8ef] bg-[#f8fafc] p-4">
                <p className="text-sm font-bold text-[#207a45]">لا توجد مواد منخفضة المخزون حاليًا.</p>
              </div>
            )}
          </div>
        </ContentCard>
      </section>
    </AppShell>
  );
}

function toneColor(tone: Tone) {
  const colors: Record<Tone, string> = {
    neutral: "#0b559f",
    success: "#207a45",
    warning: "#a16207",
    danger: "#c1121f",
  };

  return colors[tone];
}

function percentage(value: number, max: number) {
  return Math.max(0, Math.min(100, Math.round((value / Math.max(max, 1)) * 100)));
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function HorizontalBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: Tone }) {
  const ratio = percentage(value, max);
  const color = toneColor(tone);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm font-black">
        <span className="text-[#324155]">{label}</span>
        <span style={{ color }}>{formatNumber(value)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#e6edf3]">
        <div className="h-full rounded-full" style={{ width: `${ratio}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function VerticalBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: Tone }) {
  const ratio = Math.max(value > 0 ? 8 : 0, percentage(value, max));
  const color = toneColor(tone);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
      <span className="text-xs font-black" style={{ color }}>
        {formatNumber(value)}
      </span>
      <div className="flex h-44 w-full items-end justify-center rounded-md bg-white px-2 py-2">
        <div className="w-full max-w-12 rounded-t-md transition-all" style={{ height: `${ratio}%`, backgroundColor: color }} />
      </div>
      <span className="w-full truncate text-center text-xs font-bold text-[#607086]">{label}</span>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const color = toneColor(tone);

  return (
    <div className="rounded-lg border border-[#e2e8ef] bg-[#f8fafc] p-4">
      <p className="text-sm font-bold text-[#607086]">{label}</p>
      <p className="mt-3 text-3xl font-black" style={{ color }}>
        {formatNumber(value)}
      </p>
    </div>
  );
}
