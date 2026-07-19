export type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => QueryBuilder;
  };
};

type QueryResult<T = unknown> = {
  data: T[] | null;
  error: { message: string } | null;
};

type QueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns: string) => QueryBuilder<T>;
  eq: (column: string, value: unknown) => QueryBuilder<T>;
  gte: (column: string, value: unknown) => QueryBuilder<T>;
  lte: (column: string, value: unknown) => QueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder<T>;
  range: (from: number, to: number) => QueryBuilder<T>;
};

const CONTINUOUS_OPERATION_AREAS = new Set(["FINISH_MILL", "PACKHOUSE"]);
const OPERATING_DAY_WORK_TYPES = new Set(["inspection", "greasing"]);
const SOURCE_MODES = new Set(["calculated_next_due", "manual_annual_plan"]);

export type AnnualReportArea = {
  id: string;
  code: string;
  name: string;
};

export type AnnualReportDetail = {
  date: string;
  previousScheduledDate: string;
  areaCode: string;
  areaName: string;
  lineCode: string;
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  workTypeCode: string;
  workTypeName: string;
  partDescription: string;
  pointName: string;
  materialName: string;
  quantity: number | null;
  quantityUnit: string;
  executionCondition: string;
};

export type AnnualReportDay = {
  date: string;
  dayName: string;
  equipmentCount: number;
  internalTaskCount: number;
  inspectionCount: number;
  greasingCount: number;
  oilChangeCount: number;
  greaseChangeCount: number;
};

export type AnnualReportSummary = {
  key: string;
  label: string;
  equipmentCount: number;
  internalTaskCount: number;
  inspectionCount: number;
  greasingCount: number;
  oilChangeCount: number;
  greaseChangeCount: number;
};

export type LiveStatusCode = "planned" | "completed" | "overdue" | "not_executed" | "rescheduled";

export type AnnualReportLiveStatus = {
  taskId: string;
  scheduledDate: string;
  originalDueDate: string;
  areaCode: string;
  areaName: string;
  equipmentCode: string;
  equipmentName: string;
  workTypeName: string;
  statusCode: LiveStatusCode;
  statusLabel: string;
  reason: string;
};

export type AnnualMaintenanceReport = {
  year: number;
  selectedAreaCode: string | null;
  selectedWorkTypeCode: string | null;
  generatedAt: string;
  areas: AnnualReportArea[];
  days: AnnualReportDay[];
  monthlySummary: AnnualReportSummary[];
  areaSummary: AnnualReportSummary[];
  details: AnnualReportDetail[];
  liveStatus: AnnualReportLiveStatus[];
  totals: {
    daysInYear: number;
    workingDays: number;
    equipmentCount: number;
    internalTaskCount: number;
    inspectionCount: number;
    greasingCount: number;
    oilChangeCount: number;
    greaseChangeCount: number;
    livePlannedCount: number;
    liveCompletedCount: number;
    liveOverdueCount: number;
    liveNotExecutedCount: number;
    liveRescheduledCount: number;
  };
};

type ShutdownWindow = {
  line_code: string | null;
  starts_on: string;
  ends_on: string;
};

type MaintenancePointRow = {
  id: string;
  point_name: string | null;
  part_description: string | null;
  execution_condition: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  running_hours_per_day: number | null;
  frequency_hours: number | null;
  frequency_days: number | null;
  last_change_date: string | null;
  last_inspection_date: string | null;
  last_grease_date: string | null;
  schedule_anchor_date: string | null;
  original_values: Record<string, unknown> | null;
  equipment: {
    id: string;
    equipment_code: string | null;
    name: string | null;
    area_id: string | null;
    areas: AnnualReportArea | null;
    production_lines: { line_code: string | null; name: string | null } | null;
  } | null;
  materials: { name: string | null; unit: string | null; material_kind: string | null } | null;
  maintenance_work_types: { code: string | null; name: string | null } | null;
};

type PlannedTaskRow = {
  id: string;
  scheduled_date: string;
  original_due_date: string | null;
  completed_at: string | null;
  original_values: Record<string, unknown> | null;
  equipment: {
    equipment_code: string | null;
    name: string | null;
    areas: AnnualReportArea | null;
  } | null;
  maintenance_work_types: { code: string | null; name: string | null } | null;
  task_statuses: { code: string | null; name: string | null } | null;
};

type NonExecutionReportRow = {
  reason: string | null;
  planned_tasks: { id: string | null } | null;
};

type DayBucket = {
  equipmentIds: Set<string>;
  internalTaskCount: number;
  inspectionCount: number;
  greasingCount: number;
  oilChangeCount: number;
  greaseChangeCount: number;
};

export async function buildAnnualMaintenanceReport(
  supabase: SupabaseLike,
  options: { year: number; areaCode?: string | null; workTypeCode?: string | null; includeLiveStatus?: boolean },
): Promise<AnnualMaintenanceReport> {
  const year = normalizeYear(options.year);
  const selectedAreaCode = options.areaCode?.trim() || null;
  const selectedWorkTypeCode = normalizeWorkType(options.workTypeCode);
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const [{ data: areaRows, error: areasError }, { data: shutdownRows, error: shutdownError }] = await Promise.all([
    supabase.from("areas").select("id,code,name").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("shutdown_windows").select("line_code,starts_on,ends_on").eq("is_active", true).order("starts_on", { ascending: true }),
  ]);

  if (areasError) throw new Error(areasError.message);
  if (shutdownError) throw new Error(shutdownError.message);

  const areas = ((areaRows ?? []) as AnnualReportArea[]).filter((area) => area.code && area.name);
  const windowsByLine = groupShutdownWindows((shutdownRows ?? []) as ShutdownWindow[]);
  const points = await loadMaintenancePoints(supabase);
  const details: AnnualReportDetail[] = [];
  const seenPointDates = new Set<string>();

  for (const point of points) {
    const area = point.equipment?.areas ?? null;
    if (!area?.code) continue;
    if (selectedAreaCode && area.code !== selectedAreaCode) continue;

    const workTypeCode = point.maintenance_work_types?.code ?? "";
    if (!workTypeCode) continue;
    if (selectedWorkTypeCode && workTypeCode !== selectedWorkTypeCode) continue;

    const sourceMode = stringValue(point.original_values?.source_mode);
    if (sourceMode && !SOURCE_MODES.has(sourceMode)) continue;

    const anchorDate = firstDate([
      point.schedule_anchor_date,
      point.last_inspection_date,
      point.last_change_date,
      point.last_grease_date,
      stringValue(point.original_values?.last_date),
    ]);
    const runningHours = numberValue(point.running_hours_per_day ?? point.original_values?.running_hours_per_day);
    const frequencyDays = numberValue(point.frequency_days ?? point.original_values?.frequency_days);
    const frequencyHours = numberValue(point.frequency_hours ?? point.original_values?.frequency_hours);
    const stepDays = dynamicStepDays(frequencyDays, frequencyHours, runningHours);
    if (!anchorDate || !stepDays) continue;

    const lineCode = point.equipment?.production_lines?.line_code ?? stringValue(point.original_values?.line_code);
    const ignoresShutdownWindows = CONTINUOUS_OPERATION_AREAS.has(area.code);
    const scheduleLineCode = ignoresShutdownWindows ? null : lineCode;
    const usesOperatingDays = OPERATING_DAY_WORK_TYPES.has(workTypeCode);
    const executionCondition = point.execution_condition ?? "configurable";

    let rawDueDate = usesOperatingDays
      ? addOperatingDays(anchorDate, stepDays, scheduleLineCode, windowsByLine)
      : addDays(anchorDate, stepDays);

    while (rawDueDate <= end) {
      const scheduledDate = usesOperatingDays
        ? rawDueDate
        : ignoresShutdownWindows
          ? rawDueDate
          : adjustMaintenanceDueDate(rawDueDate, scheduleLineCode, executionCondition, windowsByLine);

      if (scheduledDate >= start && scheduledDate <= end) {
        const dedupeKey = `${point.id}:${scheduledDate}`;
        if (!seenPointDates.has(dedupeKey)) {
          seenPointDates.add(dedupeKey);
          const previousRawDate = usesOperatingDays
            ? subtractOperatingDays(rawDueDate, stepDays, scheduleLineCode, windowsByLine)
            : addDays(rawDueDate, -stepDays);
          const previousScheduledDate = usesOperatingDays
            ? previousRawDate
            : ignoresShutdownWindows
              ? previousRawDate
              : adjustMaintenanceDueDate(previousRawDate, scheduleLineCode, executionCondition, windowsByLine);

          details.push({
            date: scheduledDate,
            previousScheduledDate,
            areaCode: area.code,
            areaName: area.name,
            lineCode: lineCode || "لايوجد",
            equipmentId: point.equipment?.id ?? "لايوجد",
            equipmentCode: point.equipment?.equipment_code ?? "لايوجد",
            equipmentName: point.equipment?.name ?? "لايوجد",
            workTypeCode,
            workTypeName: workTypeLabel(workTypeCode, point.maintenance_work_types?.name),
            partDescription: point.part_description ?? "لايوجد",
            pointName: point.point_name ?? "لايوجد",
            materialName: point.materials?.name ?? "لايوجد",
            quantity: numberValue(point.quantity),
            quantityUnit: point.quantity_unit ?? point.materials?.unit ?? "لايوجد",
            executionCondition,
          });
        }
      }

      rawDueDate = usesOperatingDays
        ? addOperatingDays(rawDueDate, stepDays, scheduleLineCode, windowsByLine)
        : addDays(rawDueDate, stepDays);
    }
  }

  details.sort((a, b) => a.date.localeCompare(b.date) || a.equipmentCode.localeCompare(b.equipmentCode) || workTypeSort(a.workTypeCode) - workTypeSort(b.workTypeCode));

  const buckets = createDayBuckets(year);
  for (const detail of details) {
    const bucket = buckets.get(detail.date);
    if (!bucket) continue;
    bucket.equipmentIds.add(physicalEquipmentKey(detail.areaCode, detail.equipmentCode));
    bucket.internalTaskCount += 1;
    if (detail.workTypeCode === "inspection") bucket.inspectionCount += 1;
    if (detail.workTypeCode === "greasing") bucket.greasingCount += 1;
    if (detail.workTypeCode === "oil_change") bucket.oilChangeCount += 1;
    if (detail.workTypeCode === "grease_change") bucket.greaseChangeCount += 1;
  }

  const days = Array.from(buckets.entries()).map(([date, bucket]) => ({
    date,
    dayName: dayName(date),
    equipmentCount: bucket.equipmentIds.size,
    internalTaskCount: bucket.internalTaskCount,
    inspectionCount: bucket.inspectionCount,
    greasingCount: bucket.greasingCount,
    oilChangeCount: bucket.oilChangeCount,
    greaseChangeCount: bucket.greaseChangeCount,
  }));
  const monthlySummary = buildMonthlySummary(days);
  const areaSummary = buildAreaSummary(details);
  const liveStatus = options.includeLiveStatus === false ? [] : await loadAnnualReportLiveStatus(supabase, { year, areaCode: selectedAreaCode, workTypeCode: selectedWorkTypeCode });
  const liveStatusTotals = countLiveStatuses(liveStatus);

  return {
    year,
    selectedAreaCode,
    selectedWorkTypeCode,
    generatedAt: new Date().toISOString(),
    areas,
    days,
    monthlySummary,
    areaSummary,
    details,
    liveStatus,
    totals: {
      daysInYear: days.length,
      workingDays: days.filter((day) => day.internalTaskCount > 0).length,
      equipmentCount: days.reduce((sum, day) => sum + day.equipmentCount, 0),
      internalTaskCount: details.length,
      inspectionCount: details.filter((detail) => detail.workTypeCode === "inspection").length,
      greasingCount: details.filter((detail) => detail.workTypeCode === "greasing").length,
      oilChangeCount: details.filter((detail) => detail.workTypeCode === "oil_change").length,
      greaseChangeCount: details.filter((detail) => detail.workTypeCode === "grease_change").length,
      livePlannedCount: liveStatusTotals.planned,
      liveCompletedCount: liveStatusTotals.completed,
      liveOverdueCount: liveStatusTotals.overdue,
      liveNotExecutedCount: liveStatusTotals.not_executed,
      liveRescheduledCount: liveStatusTotals.rescheduled,
    },
  };
}

async function loadMaintenancePoints(supabase: SupabaseLike) {
  return fetchAll<MaintenancePointRow>((from, to) =>
    supabase
      .from("maintenance_points")
      .select(
        "id,point_name,part_description,execution_condition,quantity,quantity_unit,running_hours_per_day,frequency_hours,frequency_days,last_change_date,last_inspection_date,last_grease_date,schedule_anchor_date,original_values,equipment!inner(id,equipment_code,name,area_id,areas(id,code,name),production_lines(line_code,name)),materials(name,unit,material_kind),maintenance_work_types!inner(code,name)",
      )
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(from, to),
  );
}

export async function loadAnnualReportLiveStatus(
  supabase: SupabaseLike,
  options: { year: number; areaCode?: string | null; workTypeCode?: string | null },
): Promise<AnnualReportLiveStatus[]> {
  const year = normalizeYear(options.year);
  const selectedAreaCode = options.areaCode?.trim() || null;
  const selectedWorkTypeCode = normalizeWorkType(options.workTypeCode);
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const [tasks, nonExecutionReports] = await Promise.all([
    fetchAll<PlannedTaskRow>(
      (from, to) =>
        supabase
          .from("planned_tasks")
          .select(
          "id,scheduled_date,original_due_date,completed_at,original_values,equipment!inner(equipment_code,name,areas(id,code,name)),maintenance_work_types(code,name),task_statuses(code,name)",
        )
          .gte("scheduled_date", start)
          .lte("scheduled_date", end)
          .order("scheduled_date", { ascending: true })
          .range(from, to),
      250,
    ),
    fetchAll<NonExecutionReportRow>(
      (from, to) =>
        supabase
          .from("non_execution_reports")
          .select("reason,planned_tasks(id,scheduled_date)")
          .range(from, to),
      250,
    ),
  ]);
  const reasonsByTask = new Map<string, string>();
  for (const report of nonExecutionReports) {
    const taskId = report.planned_tasks?.id;
    if (taskId && report.reason && !reasonsByTask.has(taskId)) {
      reasonsByTask.set(taskId, report.reason);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  return tasks
    .filter((task) => {
      const areaCode = task.equipment?.areas?.code ?? "";
      const workTypeCode = task.maintenance_work_types?.code ?? "";
      if (selectedAreaCode && areaCode !== selectedAreaCode) return false;
      if (selectedWorkTypeCode && workTypeCode !== selectedWorkTypeCode) return false;
      return true;
    })
    .map((task) => {
      const status = taskLiveStatus(task, reasonsByTask.get(task.id), today);
      return {
        taskId: task.id,
        scheduledDate: task.scheduled_date,
        originalDueDate: task.original_due_date ?? task.scheduled_date,
        areaCode: task.equipment?.areas?.code ?? "لايوجد",
        areaName: task.equipment?.areas?.name ?? "لايوجد",
        equipmentCode: task.equipment?.equipment_code ?? "لايوجد",
        equipmentName: task.equipment?.name ?? "لايوجد",
        workTypeName: workTypeLabel(task.maintenance_work_types?.code ?? "", task.maintenance_work_types?.name),
        statusCode: status,
        statusLabel: liveStatusLabel(status),
        reason: reasonsByTask.get(task.id) ?? "لايوجد",
      };
    });
}

async function fetchAll<T>(makeQuery: (from: number, to: number) => PromiseLike<QueryResult<unknown>>, pageSize = 1000) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function createDayBuckets(year: number) {
  const buckets = new Map<string, DayBucket>();
  for (let date = `${year}-01-01`; date <= `${year}-12-31`; date = addDays(date, 1)) {
    buckets.set(date, {
      equipmentIds: new Set(),
      internalTaskCount: 0,
      inspectionCount: 0,
      greasingCount: 0,
      oilChangeCount: 0,
      greaseChangeCount: 0,
    });
  }
  return buckets;
}

function buildMonthlySummary(days: AnnualReportDay[]): AnnualReportSummary[] {
  return Array.from(groupByMonth(days).entries()).map(([month, monthDays]) => ({
    key: month,
    label: monthLabel(month),
    equipmentCount: monthDays.reduce((sum, day) => sum + day.equipmentCount, 0),
    internalTaskCount: monthDays.reduce((sum, day) => sum + day.internalTaskCount, 0),
    inspectionCount: monthDays.reduce((sum, day) => sum + day.inspectionCount, 0),
    greasingCount: monthDays.reduce((sum, day) => sum + day.greasingCount, 0),
    oilChangeCount: monthDays.reduce((sum, day) => sum + day.oilChangeCount, 0),
    greaseChangeCount: monthDays.reduce((sum, day) => sum + day.greaseChangeCount, 0),
  }));
}

function groupByMonth(days: AnnualReportDay[]) {
  const groups = new Map<string, AnnualReportDay[]>();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  return groups;
}

function buildAreaSummary(details: AnnualReportDetail[]): AnnualReportSummary[] {
  const groups = new Map<string, { label: string; equipmentIds: Set<string>; details: AnnualReportDetail[] }>();
  for (const detail of details) {
    const current = groups.get(detail.areaCode) ?? { label: detail.areaName, equipmentIds: new Set<string>(), details: [] };
    current.equipmentIds.add(physicalEquipmentKey(detail.areaCode, detail.equipmentCode));
    current.details.push(detail);
    groups.set(detail.areaCode, current);
  }

  return Array.from(groups.entries())
    .map(([key, group]) => ({
      key,
      label: group.label,
      equipmentCount: group.equipmentIds.size,
      internalTaskCount: group.details.length,
      inspectionCount: group.details.filter((detail) => detail.workTypeCode === "inspection").length,
      greasingCount: group.details.filter((detail) => detail.workTypeCode === "greasing").length,
      oilChangeCount: group.details.filter((detail) => detail.workTypeCode === "oil_change").length,
      greaseChangeCount: group.details.filter((detail) => detail.workTypeCode === "grease_change").length,
    }))
    .sort((a, b) => b.internalTaskCount - a.internalTaskCount);
}

function taskLiveStatus(task: PlannedTaskRow, nonExecutionReason: string | undefined, today: string): LiveStatusCode {
  const statusCode = task.task_statuses?.code;
  const isRescheduled = Boolean(task.original_values?.rescheduled_after_non_execution) || Boolean(task.original_due_date && task.original_due_date !== task.scheduled_date);
  if (task.completed_at || statusCode === "COMPLETED") return "completed";
  if (nonExecutionReason || statusCode === "MISSED") return "not_executed";
  if (isRescheduled) return "rescheduled";
  if (task.scheduled_date < today) return "overdue";
  return "planned";
}

function liveStatusLabel(status: LiveStatusCode) {
  if (status === "completed") return "مكتمل";
  if (status === "overdue") return "متأخر";
  if (status === "not_executed") return "غير منفذ";
  if (status === "rescheduled") return "معاد جدولته";
  return "مخطط";
}

function countLiveStatuses(rows: AnnualReportLiveStatus[]) {
  return rows.reduce(
    (counts, row) => {
      counts[row.statusCode] += 1;
      return counts;
    },
    { planned: 0, completed: 0, overdue: 0, not_executed: 0, rescheduled: 0 } satisfies Record<LiveStatusCode, number>,
  );
}

function physicalEquipmentKey(areaCode: string, equipmentCode: string) {
  return `${normalizeKey(areaCode)}|${normalizeKey(equipmentCode)}`;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function groupShutdownWindows(windows: ShutdownWindow[]) {
  const grouped = new Map<string, ShutdownWindow[]>();
  for (const window of windows) {
    if (!window.line_code) continue;
    const existing = grouped.get(window.line_code) ?? [];
    existing.push(window);
    grouped.set(window.line_code, existing);
  }
  for (const entries of grouped.values()) {
    entries.sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  }
  return grouped;
}

function dynamicStepDays(frequencyDays: number | null, frequencyHours: number | null, runningHoursPerDay: number | null) {
  if (frequencyDays && frequencyDays > 0) return Math.max(1, Math.floor(frequencyDays));
  if (frequencyHours && frequencyHours > 0 && runningHoursPerDay && runningHoursPerDay > 0) {
    return Math.max(1, Math.floor(frequencyHours / runningHoursPerDay));
  }
  return null;
}

function addOperatingDays(anchorDate: string, operatingDays: number, lineCode: string | null, windowsByLine: Map<string, ShutdownWindow[]>) {
  if (!lineCode) return addDays(anchorDate, operatingDays);
  let candidate = anchorDate;
  let counted = 0;
  while (counted < operatingDays) {
    candidate = addDays(candidate, 1);
    if (!isShutdownDay(lineCode, candidate, windowsByLine)) counted += 1;
  }
  return candidate;
}

function subtractOperatingDays(scheduledDate: string, operatingDays: number, lineCode: string | null, windowsByLine: Map<string, ShutdownWindow[]>) {
  if (!lineCode) return addDays(scheduledDate, -operatingDays);
  let candidate = scheduledDate;
  let counted = 0;
  while (counted < operatingDays) {
    candidate = addDays(candidate, -1);
    if (!isShutdownDay(lineCode, candidate, windowsByLine)) counted += 1;
  }
  return candidate;
}

function adjustMaintenanceDueDate(rawDue: string, lineCode: string | null, executionCondition: string, windowsByLine: Map<string, ShutdownWindow[]>) {
  const windows = lineCode ? windowsByLine.get(lineCode) ?? [] : [];
  if (executionCondition === "shutdown") {
    const matching = windows.find((window) => window.ends_on >= rawDue);
    if (!matching) return rawDue;
    if (rawDue >= matching.starts_on && rawDue <= matching.ends_on) return rawDue;
    return matching.starts_on;
  }

  let adjusted = rawDue;
  for (;;) {
    const matching = windows.find((window) => adjusted >= window.starts_on && adjusted <= window.ends_on);
    if (!matching) return adjusted;
    adjusted = addDays(matching.ends_on, 1);
  }
}

function isShutdownDay(lineCode: string, day: string, windowsByLine: Map<string, ShutdownWindow[]>) {
  return (windowsByLine.get(lineCode) ?? []).some((window) => day >= window.starts_on && day <= window.ends_on);
}

export function workTypeLabel(code: string, fallback?: string | null) {
  if (code === "inspection") return "فحص";
  if (code === "greasing") return "إضافة شحم";
  if (code === "oil_change") return "تغيير زيت";
  if (code === "grease_change") return "تغيير شحم";
  return fallback || "لايوجد";
}

export function executionConditionLabel(value: string) {
  if (value === "running") return "أثناء التشغيل";
  if (value === "shutdown") return "أثناء التوقف";
  return "حسب الإعداد";
}

function workTypeSort(code: string) {
  return ["inspection", "greasing", "oil_change", "grease_change"].indexOf(code);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dayName(date: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`));
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00.000Z`));
}

function normalizeYear(value: number) {
  if (!Number.isFinite(value)) return new Date().getUTCFullYear();
  return Math.min(2100, Math.max(2020, Math.floor(value)));
}

function normalizeWorkType(value?: string | null) {
  const code = value?.trim() ?? "";
  return ["inspection", "greasing", "oil_change", "grease_change"].includes(code) ? code : null;
}

function firstDate(values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) ?? null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
