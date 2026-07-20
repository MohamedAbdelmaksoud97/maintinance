import { approveWorkerAction } from "@/app/auth/actions";
import { ApprovalButtons } from "@/app/admin/workers/approval-buttons";
import { AreaDropdown } from "@/app/admin/workers/area-dropdown";
import { AppShell, ContentCard, MetricCard, NavButton, PageHeader, StatusBadge } from "@/app/ui/shell";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

type WorkerRow = {
  id: string;
  profile_id: string | null;
  full_name: string;
  employee_code: string | null;
  is_active: boolean;
  worker_area_assignments: { area_id: string; areas: { name: string | null; code: string | null } | null }[];
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  approval_status: string;
  created_at: string;
};

type AreaRow = {
  id: string;
  name: string;
  code: string;
};

export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const message = (await searchParams).message;
  const supabase = createClient(await cookies());
  const [{ data: profileRows }, { data: workerRows }, { data: areaRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,email,full_name,approval_status,created_at")
      .eq("role", "worker")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("workers")
      .select("id,profile_id,full_name,employee_code,is_active,worker_area_assignments(area_id,areas(name,code))")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("areas").select("id,name,code").eq("is_active", true).order("name"),
  ]);

  const profiles = (profileRows ?? []) as unknown as ProfileRow[];
  const workersByProfileId = new Map(
    ((workerRows ?? []) as unknown as WorkerRow[])
      .filter((worker) => worker.profile_id)
      .map((worker) => [worker.profile_id as string, worker]),
  );
  const areas = (areaRows ?? []) as unknown as AreaRow[];
  const rows = profiles.map((profile) => ({
    profile,
    worker: workersByProfileId.get(profile.id) ?? null,
  }));
  const pending = rows.filter((row) => row.profile.approval_status === "pending").length;
  const approved = rows.filter((row) => row.profile.approval_status === "approved").length;

  return (
    <AppShell actions={<NavButton href="/" variant="secondary">العودة للوحة الرئيسية</NavButton>}>
      <PageHeader
        eyebrow="إدارة الصلاحيات"
        title="اعتماد العمال"
        description="العامل يسجل ويؤكد البريد، ثم يظهر هنا ليتم اعتماده قبل استلام مهام الخطة."
      />

      {message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">
          {message}
        </p>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="إجمالي العمال" value={rows.length} />
        <MetricCard label="بانتظار الاعتماد" value={pending} tone="warning" />
        <MetricCard label="معتمد" value={approved} tone="success" />
      </section>

      <ContentCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#dbe3ea] text-right text-[#607086]">
                <th className="py-3 font-black">العامل</th>
                <th className="py-3 font-black">البريد</th>
                <th className="py-3 font-black">كود العامل</th>
                <th className="py-3 font-black">المناطق المسؤولة</th>
                <th className="py-3 font-black">حالة الاعتماد</th>
                <th className="py-3 font-black">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ profile, worker }) => {
                const assignedAreaIds = new Set(worker?.worker_area_assignments?.map((assignment) => assignment.area_id) ?? []);
                const status = profile.approval_status;

                return (
                  <tr key={profile.id} className="border-b border-[#edf1f5] align-top">
                    <td className="py-4 font-black">{worker?.full_name ?? profile.full_name ?? "-"}</td>
                    <td className="py-4 text-[#607086]">{profile.email ?? "-"}</td>
                    <td className="py-4 text-[#607086]">{worker?.employee_code ?? "-"}</td>
                    <td className="py-4">
                      <form action={approveWorkerAction} className="grid gap-3">
                        <input type="hidden" name="profile_id" value={profile.id} />
                        <input type="hidden" name="full_name" value={worker?.full_name ?? profile.full_name ?? profile.email ?? "عامل"} />
                        {worker?.id ? <input type="hidden" name="worker_id" value={worker.id} /> : null}
                        {!worker ? (
                          <span className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-xs font-bold text-[#a16207]">
                            سيتم إنشاء سجل العامل عند الاعتماد، ويمكنك اختيار مناطقه الآن.
                          </span>
                        ) : null}
                        {areas.length ? (
                          <AreaDropdown areas={areas} assignedAreaIds={[...assignedAreaIds]} />
                        ) : (
                          <span className="text-xs font-bold text-[#607086]">لا توجد مناطق نشطة</span>
                        )}
                        <ApprovalButtons approved={status === "approved"} />
                      </form>
                    </td>
                    <td className="py-4">
                      <Status status={status} hasWorker={Boolean(worker)} />
                    </td>
                    <td className="py-4">
                      <p className="max-w-[210px] rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] px-3 py-2 text-xs font-bold leading-6 text-[#607086]">
                        اختر المناطق من القائمة ثم احفظ. يتم تحديث مهام العامل حسب المناطق المسندة.
                      </p>
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center font-semibold text-[#607086]">
                    لا توجد حسابات عمال ظاهرة للمستخدم الحالي.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ContentCard>
    </AppShell>
  );
}

function Status({ status, hasWorker }: { status: string; hasWorker: boolean }) {
  if (!hasWorker) return <StatusBadge tone="warning">بانتظار استكمال البيانات</StatusBadge>;
  if (status === "approved") return <StatusBadge tone="success">معتمد</StatusBadge>;
  if (status === "rejected") return <StatusBadge tone="danger">مرفوض</StatusBadge>;
  return <StatusBadge tone="warning">بانتظار الاعتماد</StatusBadge>;
}
