import { AppShell, MetricCard, PageHeader } from "@/app/ui/shell";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

async function countQuality(status: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { count } = await supabase
    .from("imported_rows")
    .select("*", { count: "exact", head: true })
    .eq("quality_status", status);
  return count ?? 0;
}

export default async function DataQualityPage() {
  const [complete, missing, review, invalid] = await Promise.all([
    countQuality("COMPLETE"),
    countQuality("MISSING_DATA"),
    countQuality("NEEDS_REVIEW"),
    countQuality("INVALID"),
  ]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="جودة البيانات"
        title="استكمال بيانات الخطة"
        description="راجع السجلات التي تحتاج استكمالًا قبل توزيعها على العمال، حتى تكون الخطة واضحة للتنفيذ."
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="مكتمل" value={complete} tone="success" />
        <MetricCard label="بيانات ناقصة" value={missing} tone="warning" />
        <MetricCard label="يحتاج مراجعة" value={review} tone="warning" />
        <MetricCard label="غير صالح" value={invalid} tone="danger" />
      </section>
    </AppShell>
  );
}
