import { signOutAction } from "@/app/auth/actions";
import { AppShell, ContentCard, MetricCard, PageHeader } from "@/app/ui/shell";
import { getDashboardSummary } from "@/utils/dashboard";

type Tone = "neutral" | "success" | "warning" | "danger";

export default async function Page() {
  const summary = await getDashboardSummary();
  const attentionTotal = summary.missedTasks + summary.pendingWorkers + summary.lowStockMaterials;
  const portfolioTotal = summary.equipment + summary.materials;
  const maxDailyValue = Math.max(
    summary.missedTasks,
    summary.pendingWorkers,
    summary.todayNotifications,
    summary.lowStockMaterials,
    1,
  );
  const maxPortfolioValue = Math.max(summary.equipment, summary.materials, summary.lowStockMaterials, 1);

  return (
    <AppShell
      actions={
        <form action={signOutAction}>
          <button className="rounded-lg border border-[#cbd7e3] bg-white px-3.5 py-2 text-sm font-extrabold text-[#324155] transition hover:border-[#c1121f] hover:text-[#c1121f]">
            خروج
          </button>
        </form>
      }
    >
      <PageHeader eyebrow="لوحة الإحصائيات" title="مؤشرات الصيانة" />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="مهام متأخرة" value={summary.missedTasks} tone="danger" />
        <MetricCard label="عمال بانتظار الاعتماد" value={summary.pendingWorkers} tone="warning" />
        <MetricCard label="إشعارات اليوم" value={summary.todayNotifications} />
        <MetricCard label="الزيوت والمواد" value={summary.materials} />
        <MetricCard label="المعدات" value={summary.equipment} />
        <MetricCard label="مواد تحتاج متابعة" value={summary.lowStockMaterials} tone="warning" />
        <MetricCard label="إجمالي نقاط المتابعة" value={attentionTotal} tone={attentionTotal > 0 ? "warning" : "success"} />
      </section>

      <section className="mt-5">
        <ContentCard>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#0b559f]">أصول الصيانة</p>
              <h2 className="mt-1 text-xl font-black">المعدات والزيوت والمواد</h2>
            </div>
            <p className="rounded-md bg-[#f4f7fa] px-3 py-1 text-sm font-black text-[#516173]">
              {formatNumber(portfolioTotal)}
            </p>
          </div>

          <div className="mt-6 grid gap-4">
            <HorizontalBar label="المعدات" value={summary.equipment} max={maxPortfolioValue} tone="neutral" />
            <HorizontalBar label="الزيوت والمواد" value={summary.materials} max={maxPortfolioValue} tone="success" />
            <HorizontalBar label="مواد تحتاج متابعة" value={summary.lowStockMaterials} max={maxPortfolioValue} tone="warning" />
          </div>
        </ContentCard>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <ContentCard>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#0b559f]">حجم المتابعة</p>
              <h2 className="mt-1 text-xl font-black">مقارنة المؤشرات</h2>
            </div>
          </div>
          <div className="mt-6 flex h-72 items-end gap-3 rounded-lg border border-[#e2e8ef] bg-[#f8fafc] p-4">
            <VerticalBar label="متأخرة" value={summary.missedTasks} max={maxDailyValue} tone="danger" />
            <VerticalBar label="اعتماد" value={summary.pendingWorkers} max={maxDailyValue} tone="warning" />
            <VerticalBar label="إشعارات" value={summary.todayNotifications} max={maxDailyValue} tone="neutral" />
            <VerticalBar label="مواد" value={summary.lowStockMaterials} max={maxDailyValue} tone="success" />
          </div>
        </ContentCard>

        <ContentCard>
          <div>
            <p className="text-xs font-black text-[#0b559f]">مصفوفة المتابعة</p>
            <h2 className="mt-1 text-xl font-black">تركيز الإدارة</h2>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <StatTile label="المهام المتأخرة" value={summary.missedTasks} tone="danger" />
            <StatTile label="حسابات العمال المعلقة" value={summary.pendingWorkers} tone="warning" />
            <StatTile label="تنبيهات المواد" value={summary.lowStockMaterials} tone="warning" />
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
  const ratio = Math.max(5, percentage(value, max));
  const color = toneColor(tone);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
      <span className="text-xs font-black" style={{ color }}>
        {formatNumber(value)}
      </span>
      <div className="flex h-44 w-full items-end justify-center rounded-md bg-white px-2 py-2">
        <div className="w-full max-w-12 rounded-t-md" style={{ height: `${ratio}%`, backgroundColor: color }} />
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
