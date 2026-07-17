import type { DashboardSummary, ImportBatchSummary } from "@/types/database";
import { getSaudiDate, getSaudiToday, SYSTEM_START_DATE } from "@/utils/operational-time";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

const zeroSummary: DashboardSummary = {
  importFiles: 0,
  importedRows: 0,
  completeRows: 0,
  missingRows: 0,
  reviewRows: 0,
  invalidRows: 0,
  unassignedTasks: 0,
  missedTasks: 0,
  dueToday: 0,
  dueNext7Days: 0,
  dueNext30Days: 0,
  shutdownTasks: 0,
  materials: 0,
  equipment: 0,
  pendingWorkers: 0,
  todayNotifications: 0,
  lowStockMaterials: 0,
};

async function countRows(
  supabase: ReturnType<typeof createClient>,
  table: string,
  filter?:
    | { kind: "quality"; value: string }
    | { kind: "unassigned" }
    | { kind: "missed"; today: string }
    | { kind: "pendingWorkers" }
    | { kind: "notificationDate"; start: string; end: string }
    | { kind: "lowStock" }
    | { kind: "scheduledRange"; start: string; end?: string }
    | { kind: "shutdownTasks"; start: string },
  oldStatusId?: string,
) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (table === "planned_tasks" && oldStatusId) {
    query = query.neq("status_id", oldStatusId);
  }
  if (filter?.kind === "quality") {
    query = query.eq("quality_status", filter.value);
  }
  if (filter?.kind === "unassigned") {
    query = query.is("main_worker_id", null).gte("scheduled_date", SYSTEM_START_DATE);
  }
  if (filter?.kind === "missed") {
    query = query
      .gte("scheduled_date", SYSTEM_START_DATE)
      .lt("scheduled_date", filter.today)
      .is("completed_at", null);
  }
  if (filter?.kind === "pendingWorkers") {
    query = query.eq("role", "worker").eq("approval_status", "pending");
  }
  if (filter?.kind === "notificationDate") {
    query = query.gte("scheduled_for", filter.start).lt("scheduled_for", filter.end);
  }
  if (filter?.kind === "lowStock") {
    query = query.in("stock_status", ["LOW", "REORDER"]);
  }
  if (filter?.kind === "scheduledRange") {
    query = query.gte("scheduled_date", filter.start);
    if (filter.end) {
      query = query.lt("scheduled_date", filter.end);
    }
  }
  if (filter?.kind === "shutdownTasks") {
    query = query.gte("scheduled_date", filter.start).eq("execution_condition", "shutdown");
  }

  const { count, error } = await query;
  if (error) {
    return 0;
  }
  return count ?? 0;
}

async function countMainEquipment(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("equipment")
    .select("id,original_values")
    .eq("is_active", true);

  if (error) {
    return 0;
  }

  return (data ?? []).filter((item) => {
    const originalValues = item.original_values as Record<string, unknown> | null;
    const sourceMode = originalValues?.source_mode;
    return sourceMode === "master_equipment" || sourceMode === "manual_equipment";
  }).length;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const today = getSaudiToday();
  const tomorrowSaudi = getSaudiDate(1);
  const next7Days = getSaudiDate(7);
  const next30Days = getSaudiDate(30);
  const { data: oldStatus } = await supabase.from("task_statuses").select("id").eq("code", "OLD").maybeSingle();
  const oldStatusId = oldStatus?.id;

  const [
    importFiles,
    importedRows,
    completeRows,
    missingRows,
    reviewRows,
    invalidRows,
    unassignedTasks,
    missedTasks,
    dueToday,
    dueNext7Days,
    dueNext30Days,
    shutdownTasks,
    materials,
    equipment,
    pendingWorkers,
    todayNotifications,
    lowStockMaterials,
  ] = await Promise.all([
    countRows(supabase, "import_files"),
    countRows(supabase, "imported_rows"),
    countRows(supabase, "imported_rows", { kind: "quality", value: "COMPLETE" }),
    countRows(supabase, "imported_rows", { kind: "quality", value: "MISSING_DATA" }),
    countRows(supabase, "imported_rows", { kind: "quality", value: "NEEDS_REVIEW" }),
    countRows(supabase, "imported_rows", { kind: "quality", value: "INVALID" }),
    countRows(supabase, "planned_tasks", { kind: "unassigned" }, oldStatusId),
    countRows(supabase, "planned_tasks", { kind: "missed", today }, oldStatusId),
    countRows(supabase, "planned_tasks", { kind: "scheduledRange", start: today, end: tomorrowSaudi }, oldStatusId),
    countRows(supabase, "planned_tasks", { kind: "scheduledRange", start: today, end: next7Days }, oldStatusId),
    countRows(supabase, "planned_tasks", { kind: "scheduledRange", start: today, end: next30Days }, oldStatusId),
    countRows(supabase, "planned_tasks", { kind: "shutdownTasks", start: today }, oldStatusId),
    countRows(supabase, "materials"),
    countMainEquipment(supabase),
    countRows(supabase, "profiles", { kind: "pendingWorkers" }),
    countRows(supabase, "notification_queue", {
      kind: "notificationDate",
      start: `${today}T00:00:00+03:00`,
      end: `${tomorrowSaudi}T00:00:00+03:00`,
    }),
    countRows(supabase, "material_stock_alerts", { kind: "lowStock" }),
  ]);

  return {
    ...zeroSummary,
    importFiles,
    importedRows,
    completeRows,
    missingRows,
    reviewRows,
    invalidRows,
    unassignedTasks,
    missedTasks,
    dueToday,
    dueNext7Days,
    dueNext30Days,
    shutdownTasks,
    materials,
    equipment,
    pendingWorkers,
    todayNotifications,
    lowStockMaterials,
  };
}

export async function getLatestImportBatch(): Promise<ImportBatchSummary | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase
    .from("import_batches")
    .select("id,label,started_at,completed_at,summary")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ImportBatchSummary;
}
