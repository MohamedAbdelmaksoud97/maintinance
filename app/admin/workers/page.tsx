import { approveWorkerAction } from "@/app/auth/actions";
import { AppShell, ContentCard, MetricCard, NavButton, PageHeader, StatusBadge } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

type WorkerRow = {
  id: string;
  full_name: string;
  employee_code: string | null;
  is_active: boolean;
  worker_area_assignments: { area_id: string; areas: { name: string | null; code: string | null } | null }[];
  profiles: {
    id: string;
    email: string | null;
    approval_status: string;
  } | null;
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
  const [{ data }, { data: areaRows }] = await Promise.all([
    supabase
      .from("workers")
      .select("id,full_name,employee_code,is_active,profiles(id,email,approval_status),worker_area_assignments(area_id,areas(name,code))")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("areas").select("id,name,code").eq("is_active", true).order("name"),
  ]);

  const workers = (data ?? []) as unknown as WorkerRow[];
  const areas = (areaRows ?? []) as unknown as AreaRow[];
  const pending = workers.filter((worker) => worker.profiles?.approval_status === "pending").length;
  const approved = workers.filter((worker) => worker.profiles?.approval_status === "approved").length;

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
        <MetricCard label="إجمالي العمال" value={workers.length} />
        <MetricCard label="بانتظار الاعتماد" value={pending} tone="warning" />
        <MetricCard label="معتمد" value={approved} tone="success" />
      </section>

      <ContentCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
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
              {workers.map((worker) => {
                const assignedAreaIds = new Set(worker.worker_area_assignments?.map((assignment) => assignment.area_id) ?? []);
                const status = worker.profiles?.approval_status ?? "pending";

                return (
                  <tr key={worker.id} className="border-b border-[#edf1f5] align-top">
                    <td className="py-3 font-black">{worker.full_name}</td>
                    <td className="py-3 text-[#607086]">{worker.profiles?.email ?? "-"}</td>
                    <td className="py-3 text-[#607086]">{worker.employee_code ?? "-"}</td>
                    <td className="py-3">
                      {worker.profiles?.id ? (
                        <form id={`worker-${worker.id}-areas`} action={approveWorkerAction} className="grid gap-2 sm:grid-cols-2">
                          <input type="hidden" name="profile_id" value={worker.profiles.id} />
                          <input type="hidden" name="worker_id" value={worker.id} />
                          {areas.map((area) => (
                            <label key={area.id} className="flex items-center gap-2 rounded-lg border border-[#dbe3ea] bg-[#f8fafc] px-3 py-2 text-xs font-black text-[#324155]">
                              <input name="area_ids" type="checkbox" value={area.id} defaultChecked={assignedAreaIds.has(area.id)} className="h-4 w-4 accent-[#0b559f]" />
                              <span>{area.name}</span>
                            </label>
                          ))}
                          {!areas.length ? <span className="text-xs font-bold text-[#607086]">لا توجد مناطق نشطة</span> : null}
                        </form>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3">
                      <Status status={status} />
                    </td>
                    <td className="py-3">
                      {worker.profiles?.id ? (
                        <div className="flex flex-wrap gap-2">
                          <ApprovalButton formId={`worker-${worker.id}-areas`} approve label={status === "approved" ? "حفظ المناطق" : "اعتماد وحفظ"} />
                          <ApprovalButton formId={`worker-${worker.id}-areas`} approve={false} label="رفض" />
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
              {!workers.length ? (
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

function ApprovalButton({
  formId,
  approve,
  label,
}: {
  formId: string;
  approve: boolean;
  label: string;
}) {
  return (
    <SubmitButton
      form={formId}
      name="approve"
      value={String(approve)}
      className={`px-3 py-2 text-xs ${approve ? "bg-[#207a45] hover:bg-[#176333]" : "bg-[#c1121f] hover:bg-[#9f0f19]"}`}
      pendingText="جاري الحفظ"
    >
      {label}
    </SubmitButton>
  );
}

function Status({ status }: { status: string }) {
  if (status === "approved") return <StatusBadge tone="success">معتمد</StatusBadge>;
  if (status === "rejected") return <StatusBadge tone="danger">مرفوض</StatusBadge>;
  return <StatusBadge tone="warning">بانتظار الاعتماد</StatusBadge>;
}
