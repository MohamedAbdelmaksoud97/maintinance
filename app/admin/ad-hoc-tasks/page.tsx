import { createAdhocTaskAction } from "@/app/auth/actions";
import { AppShell, ContentCard, MetricCard, PageHeader, StatusBadge } from "@/app/ui/shell";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

type EquipmentOption = { id: string; equipment_code: string; name: string | null };
type WorkerOption = { id: string; full_name: string };
type Report = {
  id: string;
  issue: string;
  priority: string;
  status: string;
  scheduled_date: string | null;
  created_at: string;
  equipment: { equipment_code: string; name: string | null } | null;
};

export default async function AdHocTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const params = await searchParams;
  const supabase = createClient(await cookies());
  const [{ data: equipment }, { data: workers }, { data: reports }] = await Promise.all([
    supabase.from("equipment").select("id,equipment_code,name").eq("is_active", true).order("equipment_code").limit(1000),
    supabase.from("workers").select("id,full_name").eq("is_active", true).order("full_name"),
    supabase
      .from("troubleshooting_reports")
      .select("id,issue,priority,status,scheduled_date,created_at,equipment(equipment_code,name)")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const equipmentOptions = (equipment ?? []) as EquipmentOption[];
  const workerOptions = (workers ?? []) as WorkerOption[];
  const recentReports = (reports ?? []) as unknown as Report[];

  return (
    <AppShell>
      <PageHeader
        eyebrow="مهمة عارضة"
        title="إسناد مهمة عاجلة لعامل"
        description="أنشئ مهمة خارج خطة الصيانة، اختر المعدة والعامل، وسيتم تسجيلها وإرسال إشعار للعامل."
        action={<StatusBadge tone="warning">أولوية عارضة</StatusBadge>}
      />

      {params.message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">
          {params.message}
        </p>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="معدات متاحة" value={equipmentOptions.length} />
        <MetricCard label="عمال متاحون" value={workerOptions.length} />
        <MetricCard label="مهام عارضة حديثة" value={recentReports.length} />
      </section>

      <ContentCard>
        <h2 className="text-lg font-black">بيانات المهمة</h2>
        <form action={createAdhocTaskAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block text-sm font-black text-[#324155]">
            المعدة
            <select name="equipment_id" required className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-3 font-semibold outline-none">
              <option value="">اختر المعدة</option>
              {equipmentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.equipment_code} - {item.name ?? "بدون اسم"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-black text-[#324155]">
            العامل
            <select name="worker_id" required className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-3 font-semibold outline-none">
              <option value="">اختر العامل</option>
              {workerOptions.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-black text-[#324155] md:col-span-2">
            وصف المهمة
            <textarea
              name="issue"
              required
              rows={4}
              className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-3 font-semibold outline-none"
            />
          </label>
          <label className="block text-sm font-black text-[#324155]">
            اليوم
            <input
              name="scheduled_date"
              type="date"
              required
              className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-3 font-semibold outline-none"
            />
          </label>
          <label className="block text-sm font-black text-[#324155]">
            الأولوية
            <select name="priority" defaultValue="normal" className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-3 font-semibold outline-none">
              <option value="low">منخفضة</option>
              <option value="normal">عادية</option>
              <option value="high">عالية</option>
              <option value="urgent">عاجلة</option>
            </select>
          </label>
          <button className="self-end rounded-lg bg-[#0b559f] px-4 py-3 text-sm font-black text-white shadow-sm">
            إنشاء وإشعار العامل
          </button>
        </form>
      </ContentCard>

      <section className="mt-5 grid gap-3">
        {recentReports.map((report) => (
          <ContentCard key={report.id}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-black">{report.issue}</h2>
                <p className="mt-1 text-sm text-[#607086]">
                  {report.equipment?.equipment_code ?? "-"} - {report.equipment?.name ?? "معدة"}
                </p>
              </div>
              <StatusBadge>{report.status}</StatusBadge>
              {report.scheduled_date ? <StatusBadge tone="neutral">{report.scheduled_date}</StatusBadge> : null}
            </div>
          </ContentCard>
        ))}
      </section>
    </AppShell>
  );
}
