import { createMaterialPurchaseAction, upsertMaterialAction } from "@/app/auth/actions";
import { AppShell, ContentCard, NavButton, PageHeader, StatusBadge } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { InputHTMLAttributes } from "react";

type Material = {
  id: string;
  material_kind: string;
  code: string | null;
  name: string;
  brand: string | null;
  grade: string | null;
  unit: string | null;
  minimum_stock: number | null;
  reorder_level: number | null;
  original_values: Record<string, unknown> | null;
};

type Stock = {
  stock_quantity: number | null;
  stock_status: "OK" | "LOW" | "REORDER" | string;
};

type Transaction = {
  id: string;
  transaction_type: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  transaction_date: string;
  notes: string | null;
  source_type: string | null;
};

type TaskUsage = {
  id: string;
  scheduled_date: string;
  planned_quantity: number | null;
  planned_quantity_unit: string | null;
  completed_at: string | null;
  equipment: { equipment_code: string; name: string | null } | null;
  maintenance_work_types: { code: string | null; name: string | null } | null;
};

export default async function MaterialDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { id } = await params;
  const { message } = await searchParams;
  const supabase = createClient(await cookies());
  const [{ data: material }, { data: stock }, { data: transactions }, { data: tasks }] = await Promise.all([
    supabase
      .from("materials")
      .select("id,material_kind,code,name,brand,grade,unit,minimum_stock,reorder_level,original_values")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("material_stock_alerts")
      .select("stock_quantity,stock_status")
      .eq("material_id", id)
      .maybeSingle(),
    supabase
      .from("inventory_transactions")
      .select("id,transaction_type,quantity,unit,unit_price,transaction_date,notes,source_type")
      .eq("material_id", id)
      .order("transaction_date", { ascending: false })
      .limit(25),
    supabase
      .from("planned_tasks")
      .select("id,scheduled_date,planned_quantity,planned_quantity_unit,completed_at,equipment(equipment_code,name),maintenance_work_types(code,name)")
      .eq("material_id", id)
      .order("scheduled_date", { ascending: false })
      .limit(12),
  ]);

  if (!material) notFound();

  const item = material as Material;
  const currentStock = stock as Stock | null;
  const movementRows = (transactions ?? []) as Transaction[];
  const taskRows = (tasks ?? []) as unknown as TaskUsage[];
  const sourceValues = item.original_values ?? {};

  return (
    <AppShell actions={<NavButton href="/admin/materials" variant="secondary">العودة للمخزون</NavButton>}>
      <PageHeader
        eyebrow={item.material_kind === "grease" ? "تفاصيل شحم" : "تفاصيل زيت"}
        title={item.name}
        description="رصيد المادة، حدود التنبيه، سجل الحركات، والمهام المرتبطة بها."
        action={<StatusBadge tone={stockTone(currentStock?.stock_status ?? "OK")}>{stockLabel(currentStock?.stock_status ?? "OK")}</StatusBadge>}
      />

      {message ? (
        <p className="mb-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">
          {message}
        </p>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <ContentCard>
          <h2 className="text-lg font-black">الرصيد الحالي</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="الرصيد" value={`${formatNumber(currentStock?.stock_quantity)} ${item.unit ?? ""}`} />
            <Info label="الحالة" value={stockLabel(currentStock?.stock_status ?? "OK")} />
            <Info label="الحد الأدنى" value={formatNumber(item.minimum_stock)} />
            <Info label="حد إعادة الطلب" value={formatNumber(item.reorder_level)} />
          </div>

          <div className="mt-5 border-t border-[#e2e8ef] pt-4">
            <h3 className="font-black">بيانات SAP</h3>
            <div className="mt-3 grid gap-2">
              <Info label="كود SAP" value={item.code ?? "-"} />
              <Info label="الوصف" value={valueText(sourceValues.sap_description) || "-"} />
              <Info label="رقم المادة القديم" value={valueText(sourceValues.old_material_no) || "-"} />
              <Info label="تاريخ مصدر الرصيد" value={valueText(sourceValues.stock_source_date) || "-"} />
            </div>
          </div>
        </ContentCard>

        <ContentCard>
          <h2 className="text-lg font-black">تعديل بيانات المادة</h2>
          <form action={upsertMaterialAction} className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="material_id" value={item.id} />
            <input type="hidden" name="return_to" value={`/admin/materials/${item.id}`} />
            <label className="block text-sm font-black text-[#324155]">
              النوع
              <select name="material_kind" defaultValue={item.material_kind} className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none">
                <option value="oil">زيت</option>
                <option value="grease">شحم</option>
              </select>
            </label>
            <Field name="code" label="كود SAP" defaultValue={item.code ?? ""} />
            <Field name="name" label="اسم المادة" defaultValue={item.name} required />
            <Field name="brand" label="الشركة/العلامة" defaultValue={item.brand ?? ""} />
            <Field name="grade" label="الدرجة" defaultValue={item.grade ?? ""} />
            <Field name="unit" label="الوحدة" defaultValue={item.unit ?? ""} />
            <Field name="minimum_stock" label="الحد الأدنى" type="number" step="0.001" defaultValue={item.minimum_stock?.toString() ?? ""} />
            <Field name="reorder_level" label="حد إعادة الطلب" type="number" step="0.001" defaultValue={item.reorder_level?.toString() ?? ""} />
            <SubmitButton className="md:col-span-2" pendingText="جاري الحفظ">حفظ التعديل</SubmitButton>
          </form>
        </ContentCard>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <ContentCard>
          <h2 className="text-lg font-black">إضافة كمية مشتراة</h2>
          <form action={createMaterialPurchaseAction} className="mt-4 grid gap-3">
            <input type="hidden" name="material_id" value={item.id} />
            <input type="hidden" name="return_to" value={`/admin/materials/${item.id}`} />
            <Field name="quantity" label="الكمية" type="number" min="0.001" step="0.001" required />
            <Field name="unit" label="الوحدة" defaultValue={item.unit ?? ""} />
            <Field name="unit_price" label="سعر الوحدة اختياري" type="number" min="0" step="0.001" />
            <Field name="transaction_date" label="وقت الشراء" type="datetime-local" />
            <label className="block text-sm font-black text-[#324155]">
              ملاحظات
              <textarea name="notes" rows={3} className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none" />
            </label>
            <SubmitButton pendingText="جاري الإضافة">إضافة للمخزون</SubmitButton>
          </form>
        </ContentCard>

        <ContentCard>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black">سجل الحركات</h2>
            <StatusBadge>{movementRows.length.toLocaleString("ar-EG")}</StatusBadge>
          </div>
          <div className="mt-4 grid gap-2">
            {movementRows.map((transaction) => (
              <div key={transaction.id} className="grid gap-2 rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-3 text-sm md:grid-cols-[1fr_0.7fr_0.8fr]">
                <Info label={transactionTypeLabel(transaction.transaction_type)} value={formatDateTime(transaction.transaction_date)} />
                <Info label="الكمية" value={`${formatNumber(transaction.quantity)} ${transaction.unit ?? item.unit ?? ""}`} />
                <Info label="المصدر" value={transaction.source_type ?? transaction.notes ?? "-"} />
              </div>
            ))}
            {!movementRows.length ? <p className="text-sm font-bold text-[#607086]">لا توجد حركات مخزون لهذه المادة بعد.</p> : null}
          </div>
        </ContentCard>
      </section>

      <section className="mt-5">
        <ContentCard>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black">مهام مرتبطة</h2>
            <StatusBadge>{taskRows.length.toLocaleString("ar-EG")}</StatusBadge>
          </div>
          <div className="mt-4 grid gap-2">
            {taskRows.map((task) => (
              <div key={task.id} className="grid gap-2 rounded-lg border border-[#e2e8ef] bg-[#fbfcfd] p-3 text-sm md:grid-cols-[1fr_0.8fr_0.7fr]">
                <Info label="المعدة" value={`${task.equipment?.equipment_code ?? "-"} - ${task.equipment?.name ?? "معدة"}`} />
                <Info label="التاريخ / النوع" value={`${task.scheduled_date} · ${workTypeLabel(task.maintenance_work_types?.code)}`} />
                <Info label="الكمية" value={`${formatNumber(task.planned_quantity)} ${task.planned_quantity_unit ?? item.unit ?? ""}`} />
              </div>
            ))}
            {!taskRows.length ? <p className="text-sm font-bold text-[#607086]">لا توجد مهام ظاهرة مرتبطة بهذه المادة.</p> : null}
          </div>
        </ContentCard>
      </section>
    </AppShell>
  );
}

function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block text-sm font-black text-[#324155]">
      {label}
      <input
        {...props}
        className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 font-semibold outline-none transition focus:border-[#0b559f] focus:ring-4 focus:ring-[#0b559f]/10"
      />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#e2e8ef] bg-white p-3">
      <p className="text-xs font-black text-[#607086]">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-[#172033]">{value}</p>
    </div>
  );
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("en-US");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(new Date(value));
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function stockTone(value: string): "success" | "warning" | "danger" {
  if (value === "REORDER") return "danger";
  if (value === "LOW") return "warning";
  return "success";
}

function stockLabel(value: string) {
  if (value === "REORDER") return "إعادة طلب";
  if (value === "LOW") return "منخفض";
  return "جيد";
}

function transactionTypeLabel(value: string) {
  if (value === "opening") return "رصيد افتتاحي";
  if (value === "purchase") return "شراء";
  if (value === "planned_consumption") return "استهلاك مهمة";
  if (value === "adjustment_in") return "تسوية إضافة";
  if (value === "adjustment_out") return "تسوية خصم";
  return "حركة مخزون";
}

function workTypeLabel(value?: string | null) {
  if (value === "oil_change") return "تغيير زيت";
  if (value === "grease_change") return "تغيير شحم";
  if (value === "greasing") return "إضافة شحم";
  if (value === "inspection") return "فحص";
  return "مهمة";
}
