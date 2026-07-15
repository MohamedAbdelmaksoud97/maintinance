import { AppShell, ContentCard, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

type TroubleshootingCost = {
  troubleshooting_report_id: string;
  issue: string;
  priority: string;
  status: string;
  material_cost: number;
  overtime_cost: number;
  additional_expenses: number;
  total_cost: number;
};

export default async function TroubleshootingPage() {
  const supabase = createClient(await cookies());
  const { data } = await supabase
    .from("troubleshooting_costs")
    .select("*")
    .order("total_cost", { ascending: false })
    .limit(100);

  const reports = (data ?? []) as TroubleshootingCost[];
  const total = reports.reduce((sum, report) => sum + Number(report.total_cost ?? 0), 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="تكلفة الأعمال العارضة"
        title="تقارير المهام العارضة"
        description="متابعة تكلفة المواد وساعات العمل والمصاريف لأي عمل خارج الخطة اليومية."
        action={<StatusBadge tone="warning">خارج الخطة</StatusBadge>}
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="عدد التقارير" value={reports.length} />
        <MetricCard label="إجمالي التكلفة" value={`${total.toLocaleString("ar-EG")} SAR`} tone="danger" />
        <MetricCard label="مصدر التكلفة" value="مواد + عمالة + مصاريف" tone="warning" />
      </section>

      <section className="grid gap-3">
        {reports.map((report) => (
          <ContentCard key={report.troubleshooting_report_id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-black">{report.issue}</h2>
                <p className="mt-1 text-sm text-[#607086]">
                  الأولوية: {report.priority} | الحالة: {report.status}
                </p>
              </div>
              <p className="rounded-lg bg-[#fff0f1] px-3 py-2 text-xl font-black text-[#c1121f]">
                {Number(report.total_cost).toLocaleString("ar-EG")} SAR
              </p>
            </div>
          </ContentCard>
        ))}
        {!reports.length ? (
          <ContentCard>
            <p className="text-sm font-semibold text-[#607086]">لا توجد تقارير مسجلة حتى الآن.</p>
          </ContentCard>
        ) : null}
      </section>
    </AppShell>
  );
}
