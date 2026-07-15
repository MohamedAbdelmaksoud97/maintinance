import { AppShell, ContentCard, NavButton, PageHeader, StatusBadge } from "@/app/ui/shell";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

type Oil = {
  id: string;
  code: string | null;
  name: string;
  brand: string | null;
  grade: string | null;
  unit: string | null;
  minimum_stock: number | null;
  reorder_level: number | null;
};

type TaskUsage = {
  id: string;
  scheduled_date: string;
  equipment: { equipment_code: string; name: string | null } | null;
};

export default async function OilDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { id } = await params;
  const { message } = await searchParams;
  const supabase = createClient(await cookies());
  const [{ data: oil }, { data: tasks }] = await Promise.all([
    supabase
      .from("materials")
      .select("id,code,name,brand,grade,unit,minimum_stock,reorder_level")
      .eq("id", id)
      .eq("material_kind", "oil")
      .maybeSingle(),
    supabase
      .from("planned_tasks")
      .select("id,scheduled_date,equipment(equipment_code,name)")
      .eq("material_id", id)
      .order("scheduled_date", { ascending: true })
      .limit(12),
  ]);

  if (!oil) notFound();

  const item = oil as Oil;
  const usage = (tasks ?? []) as unknown as TaskUsage[];

  return (
    <AppShell
      actions={
        <>
          <NavButton href="/admin/oils" variant="secondary">العودة للزيوت</NavButton>
          <NavButton href={`/admin/oils/${item.id}/edit`}>تعديل الزيت</NavButton>
        </>
      }
    >
      <PageHeader
        eyebrow="تفاصيل الزيت"
        title={item.name}
        description="بيانات الزيت وحدود المخزون والمهام المرتبطة به."
        action={<StatusBadge>{item.unit ?? "L"}</StatusBadge>}
      />

      {message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">
          {message}
        </p>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <ContentCard>
          <h2 className="text-lg font-black">البيانات الأساسية</h2>
          <div className="mt-4 grid gap-3">
            <Info label="الكود" value={item.code ?? "-"} />
            <Info label="اسم الزيت" value={item.name} />
            <Info label="الشركة / العلامة" value={item.brand ?? "-"} />
            <Info label="الدرجة" value={item.grade ?? "-"} />
          </div>
        </ContentCard>

        <ContentCard>
          <h2 className="text-lg font-black">المخزون والاستخدام</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Info label="الوحدة" value={item.unit ?? "L"} />
            <Info label="الحد الأدنى" value={item.minimum_stock?.toString() ?? "-"} />
            <Info label="حد إعادة الطلب" value={item.reorder_level?.toString() ?? "-"} />
          </div>

          <div className="mt-5 border-t border-[#e2e8ef] pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-black">مهام مرتبطة</h3>
              <StatusBadge>{usage.length.toLocaleString("ar-EG")}</StatusBadge>
            </div>
            <div className="grid gap-2">
              {usage.map((task) => (
                <div key={task.id} className="rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-3 text-sm font-bold">
                  {task.scheduled_date} · {task.equipment?.equipment_code ?? "-"} - {task.equipment?.name ?? "معدة"}
                </div>
              ))}
              {!usage.length ? <p className="text-sm font-bold text-[#607086]">لا توجد مهام ظاهرة مرتبطة بهذا الزيت.</p> : null}
            </div>
          </div>
        </ContentCard>
      </section>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-3">
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-[#172033]">{value}</p>
    </div>
  );
}
