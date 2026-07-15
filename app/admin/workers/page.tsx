import { approveWorkerAction } from "@/app/auth/actions";
import { AppShell, ContentCard, MetricCard, NavButton, PageHeader, StatusBadge } from "@/app/ui/shell";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

type WorkerRow = {
  id: string;
  full_name: string;
  employee_code: string | null;
  is_active: boolean;
  profiles: {
    id: string;
    email: string | null;
    approval_status: string;
  } | null;
};

export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const message = (await searchParams).message;
  const supabase = createClient(await cookies());
  const { data } = await supabase
    .from("workers")
    .select("id,full_name,employee_code,is_active,profiles(id,email,approval_status)")
    .order("created_at", { ascending: false })
    .limit(100);

  const workers = (data ?? []) as unknown as WorkerRow[];
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
                <th className="py-3 font-black">حالة الاعتماد</th>
                <th className="py-3 font-black">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => (
                <tr key={worker.id} className="border-b border-[#edf1f5]">
                  <td className="py-3 font-black">{worker.full_name}</td>
                  <td className="py-3 text-[#607086]">{worker.profiles?.email ?? "-"}</td>
                  <td className="py-3 text-[#607086]">{worker.employee_code ?? "-"}</td>
                  <td className="py-3">
                    <Status status={worker.profiles?.approval_status ?? "pending"} />
                  </td>
                  <td className="py-3">
                    {worker.profiles?.id ? (
                      <div className="flex gap-2">
                        <ApprovalButton profileId={worker.profiles.id} approve label="اعتماد" />
                        <ApprovalButton profileId={worker.profiles.id} approve={false} label="رفض" />
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
              {!workers.length ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center font-semibold text-[#607086]">
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
  profileId,
  approve,
  label,
}: {
  profileId: string;
  approve: boolean;
  label: string;
}) {
  return (
    <form action={approveWorkerAction}>
      <input type="hidden" name="profile_id" value={profileId} />
      <input type="hidden" name="approve" value={String(approve)} />
      <button
        className={
          approve
            ? "rounded-lg bg-[#207a45] px-3 py-2 text-xs font-black text-white shadow-sm"
            : "rounded-lg bg-[#c1121f] px-3 py-2 text-xs font-black text-white shadow-sm"
        }
      >
        {label}
      </button>
    </form>
  );
}

function Status({ status }: { status: string }) {
  if (status === "approved") return <StatusBadge tone="success">معتمد</StatusBadge>;
  if (status === "rejected") return <StatusBadge tone="danger">مرفوض</StatusBadge>;
  return <StatusBadge tone="warning">بانتظار الاعتماد</StatusBadge>;
}
