import ExcelJS from "exceljs";
import {
  buildAnnualMaintenanceReport,
  executionConditionLabel,
  loadAnnualReportLiveStatus,
  type AnnualMaintenanceReport,
  type AnnualReportDetail,
  type AnnualReportLiveStatus,
  type AnnualReportSummary,
  type SupabaseLike,
} from "@/utils/annual-maintenance-report";
import { getSaudiToday } from "@/utils/operational-time";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 120;

type MaterialStockAlertRow = {
  material_id: string;
  material_kind: string | null;
  code: string | null;
  name: string | null;
  unit: string | null;
  stock_quantity: number | string | null;
  minimum_stock: number | string | null;
  reorder_level: number | string | null;
  stock_status: string | null;
};

const PLAN_FIXED_COLUMNS = [
  { header: "Area", width: 18 },
  { header: "Line", width: 10 },
  { header: "Equipment Code", width: 18 },
  { header: "Equipment Name", width: 24 },
  { header: "Part / Description", width: 28 },
  { header: "Point", width: 16 },
  { header: "Material", width: 22 },
  { header: "Quantity", width: 10 },
  { header: "Unit", width: 10 },
  { header: "Execution Condition", width: 18 },
] as const;

const WORK_TYPE_SYMBOLS: Record<string, { symbol: string; fill: string; label: string; priority: number }> = {
  inspection: { symbol: "I", fill: "FFFFFF00", label: "Inspection", priority: 10 },
  greasing: { symbol: "G", fill: "FFF4B183", label: "Greasing", priority: 20 },
  oil_change: { symbol: "O", fill: "FF00B050", label: "Oil Change", priority: 30 },
  grease_change: { symbol: "GC", fill: "FFC659FF", label: "Grease Change", priority: 40 },
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const currentYear = Number(getSaudiToday().slice(0, 4));
  const year = validYear(url.searchParams.get("year")) ?? currentYear;
  const areaCode = url.searchParams.get("area")?.trim() || null;
  const workTypeCode = validWorkType(url.searchParams.get("workType"));
  const supabase = createClient(await cookies());
  const report = await buildAnnualMaintenanceReport(supabase as unknown as SupabaseLike, { year, areaCode, workTypeCode, includeLiveStatus: false });
  const inventoryRows = await withTimeout<MaterialStockAlertRow[]>(loadInventoryStock(supabase), 5000, []);
  const liveStatus = await withTimeout<AnnualReportLiveStatus[]>(
    loadAnnualReportLiveStatus(supabase as unknown as SupabaseLike, { year, areaCode, workTypeCode }),
    5000,
    [],
  );
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SPCC Maintenance System";
  workbook.created = new Date();
  workbook.subject = "Annual Maintenance Plan";
  workbook.title = `Annual Maintenance Plan ${report.year}`;
  addAnnualPlanSheet(workbook, report);
  addInventorySheet(workbook, inventoryRows);

  const summarySheet = workbook.addWorksheet("الخطة اليومية", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  summarySheet.columns = [
    { header: "التاريخ", key: "date", width: 14 },
    { header: "اليوم", key: "dayName", width: 14 },
    { header: "ظهور المعدات", key: "equipmentCount", width: 16 },
    { header: "أعمال داخلية", key: "internalTaskCount", width: 16 },
    { header: "فحص", key: "inspectionCount", width: 12 },
    { header: "إضافة شحم", key: "greasingCount", width: 14 },
    { header: "تغيير زيت", key: "oilChangeCount", width: 14 },
    { header: "تغيير شحم", key: "greaseChangeCount", width: 14 },
  ];
  summarySheet.addRows(report.days);
  styleWorksheet(summarySheet, { stripeRows: true });

  const detailsSheet = workbook.addWorksheet("تفاصيل الأعمال", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  detailsSheet.columns = [
    { header: "التاريخ", key: "date", width: 14 },
    { header: "المنطقة", key: "areaName", width: 20 },
    { header: "الخط", key: "lineCode", width: 10 },
    { header: "كود المعدة", key: "equipmentCode", width: 18 },
    { header: "اسم المعدة", key: "equipmentName", width: 24 },
    { header: "نوع العمل", key: "workTypeName", width: 16 },
    { header: "الجزء", key: "partDescription", width: 28 },
    { header: "عدد النقاط", key: "pointName", width: 14 },
    { header: "المادة", key: "materialName", width: 18 },
    { header: "الكمية", key: "quantity", width: 12 },
    { header: "الوحدة", key: "quantityUnit", width: 12 },
    { header: "شرط التنفيذ", key: "executionCondition", width: 16 },
    { header: "آخر تنفيذ مفترض", key: "previousScheduledDate", width: 18 },
  ];
  detailsSheet.addRows(
    report.details.map((detail) => ({
      ...detail,
      quantity: detail.quantity ?? 0,
      executionCondition: executionConditionLabel(detail.executionCondition),
    })),
  );
  styleWorksheet(detailsSheet);

  const executiveSheet = workbook.addWorksheet("ملخص تنفيذي", { views: [{ rightToLeft: true }] });
  executiveSheet.addRows([
    ["تقرير الخطة السنوية للصيانة", ""],
    ["السنة", report.year],
    ["المنطقة", areaCode || "كل المناطق"],
    ["نوع العمل", workTypeCode ? workTypeLabel(workTypeCode) : "كل أنواع العمل"],
    ["تاريخ التوليد", formatDateTime(report.generatedAt)],
    ["", ""],
    ["المؤشر", "القيمة"],
    ["أيام السنة", report.totals.daysInYear],
    ["أيام بها أعمال", report.totals.workingDays],
    ["إجمالي ظهور المعدات خلال السنة", report.totals.equipmentCount],
    ["أعمال داخلية", report.totals.internalTaskCount],
    ["فحص", report.totals.inspectionCount],
    ["إضافة شحم", report.totals.greasingCount],
    ["تغيير زيت", report.totals.oilChangeCount],
    ["تغيير شحم", report.totals.greaseChangeCount],
    ["مخطط حاليا", report.totals.livePlannedCount],
    ["مكتمل حاليا", report.totals.liveCompletedCount],
    ["متأخر حاليا", report.totals.liveOverdueCount],
    ["غير منفذ حاليا", report.totals.liveNotExecutedCount],
    ["معاد جدولته حاليا", report.totals.liveRescheduledCount],
  ]);
  executiveSheet.columns = [{ width: 34 }, { width: 24 }];
  styleExecutiveSheet(executiveSheet);

  const monthlySheet = workbook.addWorksheet("ملخص شهري", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  addSummarySheet(monthlySheet, "الشهر", report.monthlySummary);

  const areaSheet = workbook.addWorksheet("ملخص المناطق", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  addSummarySheet(areaSheet, "المنطقة", report.areaSummary);

  const liveSheet = workbook.addWorksheet("الحالة الحالية", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  liveSheet.columns = [
    { header: "التاريخ", key: "scheduledDate", width: 14 },
    { header: "التاريخ الأصلي", key: "originalDueDate", width: 14 },
    { header: "الحالة", key: "statusLabel", width: 16 },
    { header: "المنطقة", key: "areaName", width: 20 },
    { header: "كود المعدة", key: "equipmentCode", width: 18 },
    { header: "اسم المعدة", key: "equipmentName", width: 24 },
    { header: "نوع العمل", key: "workTypeName", width: 16 },
    { header: "سبب عدم التنفيذ", key: "reason", width: 34 },
  ];
  liveSheet.addRows(liveStatus);
  styleWorksheet(liveSheet, { stripeRows: true });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `annual-maintenance-plan-${report.year}${areaCode ? `-${areaCode}` : ""}${workTypeCode ? `-${workTypeCode}` : ""}.xlsx`;

  return new Response(buffer as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function addSummarySheet(sheet: ExcelJS.Worksheet, firstColumnHeader: string, rows: AnnualReportSummary[]) {
  sheet.columns = [
    { header: firstColumnHeader, key: "label", width: 22 },
    { header: "ظهور المعدات", key: "equipmentCount", width: 16 },
    { header: "أعمال داخلية", key: "internalTaskCount", width: 16 },
    { header: "فحص", key: "inspectionCount", width: 12 },
    { header: "إضافة شحم", key: "greasingCount", width: 14 },
    { header: "تغيير زيت", key: "oilChangeCount", width: 14 },
    { header: "تغيير شحم", key: "greaseChangeCount", width: 14 },
  ];
  sheet.addRows(rows);
  styleWorksheet(sheet, { stripeRows: true });
}

function addAnnualPlanSheet(workbook: ExcelJS.Workbook, report: AnnualMaintenanceReport) {
  const fixedColumnCount = PLAN_FIXED_COLUMNS.length;
  const dates = yearDates(report.year);
  const sheet = workbook.addWorksheet("الخطة السنوية", {
    views: [{ state: "frozen", xSplit: fixedColumnCount, ySplit: 4 }],
  });
  sheet.properties.defaultRowHeight = 18;

  for (let columnIndex = 1; columnIndex <= fixedColumnCount + dates.length; columnIndex += 1) {
    sheet.getColumn(columnIndex).width = columnIndex <= fixedColumnCount ? PLAN_FIXED_COLUMNS[columnIndex - 1].width : 5;
    sheet.getColumn(columnIndex).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }

  sheet.mergeCells(1, 1, 1, fixedColumnCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `Annual Plan ${report.year}`;
  titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.fill = solidFill("FF0B559F");
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 26;

  addPlanLegend(sheet, fixedColumnCount + 1);
  addPlanMonthHeader(sheet, dates, fixedColumnCount);
  addPlanDateHeader(sheet, dates, fixedColumnCount);

  const groupedRows = annualPlanRows(report.details);
  groupedRows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(rowIndex + 5);
    const fixedValues = [
      row.detail.areaName,
      row.detail.lineCode,
      row.detail.equipmentCode,
      row.detail.equipmentName,
      row.detail.partDescription,
      row.detail.pointName,
      row.detail.materialName,
      row.detail.quantity ?? 0,
      row.detail.quantityUnit,
      executionConditionLabel(row.detail.executionCondition),
    ];

    fixedValues.forEach((value, index) => {
      const cell = excelRow.getCell(index + 1);
      cell.value = value;
      cell.border = thinBorder();
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      if (rowIndex % 2 === 1) cell.fill = solidFill("FFF8FAFC");
    });

    dates.forEach((date, dateIndex) => {
      const cell = excelRow.getCell(fixedColumnCount + dateIndex + 1);
      const workTypes = row.workTypesByDate.get(date) ?? [];
      if (workTypes.length > 0) {
        cell.value = workTypes.map((code) => WORK_TYPE_SYMBOLS[code]?.symbol ?? code).join(" + ");
        cell.font = { bold: true, color: { argb: planSymbolFontColor(workTypes) } };
        cell.fill = solidFill(workTypes.length === 1 ? (WORK_TYPE_SYMBOLS[workTypes[0]]?.fill ?? "FFE2E8EF") : "FFD9E2F3");
      } else if (rowIndex % 2 === 1) {
        cell.fill = solidFill("FFF8FAFC");
      }
      cell.border = thinBorder("FFC7D2DE");
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
  });

  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: fixedColumnCount + dates.length },
  };
}

function addInventorySheet(workbook: ExcelJS.Workbook, rows: MaterialStockAlertRow[]) {
  const sheet = workbook.addWorksheet("مخزون الزيوت والشحم", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "النوع", key: "material_kind", width: 14 },
    { header: "كود SAP", key: "code", width: 18 },
    { header: "اسم المادة", key: "name", width: 34 },
    { header: "الوحدة", key: "unit", width: 12 },
    { header: "الرصيد الحالي", key: "stock_quantity", width: 16 },
    { header: "الحد الأدنى", key: "minimum_stock", width: 14 },
    { header: "حد إعادة الطلب", key: "reorder_level", width: 16 },
    { header: "حالة المخزون", key: "stock_status", width: 16 },
  ];
  sheet.addRows(
    rows.map((row) => ({
      material_kind: materialKindLabel(row.material_kind),
      code: row.code ?? "",
      name: row.name ?? "",
      unit: row.unit ?? "",
      stock_quantity: numberOrZero(row.stock_quantity),
      minimum_stock: numberOrZero(row.minimum_stock),
      reorder_level: numberOrZero(row.reorder_level),
      stock_status: stockStatusLabel(row.stock_status),
    })),
  );
  styleWorksheet(sheet, { stripeRows: true });
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return;
    const statusCell = row.getCell(8);
    statusCell.font = { bold: true, color: { argb: statusFontColor(String(statusCell.value ?? "")) } };
    statusCell.fill = solidFill(statusFillColor(String(statusCell.value ?? "")));
  });
}

function styleExecutiveSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ rightToLeft: true }];
  sheet.mergeCells("A1:B1");
  const title = sheet.getCell("A1");
  title.font = { bold: true, size: 16, color: { argb: "FF0B559F" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;
  sheet.getRow(7).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B559F" } };
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8EF" } },
        bottom: { style: "thin", color: { argb: "FFE2E8EF" } },
        left: { style: "thin", color: { argb: "FFE2E8EF" } },
        right: { style: "thin", color: { argb: "FFE2E8EF" } },
      };
    });
  });
}

function styleWorksheet(sheet: ExcelJS.Worksheet, options: { stripeRows?: boolean } = {}) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B559F" } };
  header.alignment = { horizontal: "center", vertical: "middle" };
  header.height = 22;

  sheet.columns.forEach((column) => {
    column.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  header.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "FFE2E8EF" } },
      bottom: { style: "thin", color: { argb: "FFE2E8EF" } },
      left: { style: "thin", color: { argb: "FFE2E8EF" } },
      right: { style: "thin", color: { argb: "FFE2E8EF" } },
    };
  });

  if (options.stripeRows) {
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 1 || rowNumber % 2 !== 0) return;
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    });
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
}

async function loadInventoryStock(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("material_stock_alerts")
    .select("material_id,material_kind,code,name,unit,stock_quantity,minimum_stock,reorder_level,stock_status")
    .order("material_kind", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as MaterialStockAlertRow[];
}

function addPlanLegend(sheet: ExcelJS.Worksheet, startColumn: number) {
  let column = startColumn;
  for (const config of Object.values(WORK_TYPE_SYMBOLS).sort((a, b) => a.priority - b.priority)) {
    const symbolCell = sheet.getCell(1, column);
    symbolCell.value = config.symbol;
    symbolCell.font = { bold: true, color: { argb: config.symbol === "O" ? "FFFFFFFF" : "FF172033" } };
    symbolCell.fill = solidFill(config.fill);
    symbolCell.alignment = { horizontal: "center", vertical: "middle" };
    symbolCell.border = thinBorder();

    const labelCell = sheet.getCell(1, column + 1);
    labelCell.value = config.label;
    labelCell.font = { bold: true, color: { argb: "FF172033" } };
    labelCell.alignment = { horizontal: "center", vertical: "middle" };
    labelCell.border = thinBorder();
    column += 2;
  }
}

function addPlanMonthHeader(sheet: ExcelJS.Worksheet, dates: string[], fixedColumnCount: number) {
  sheet.mergeCells(3, 1, 3, fixedColumnCount);
  const fixedHeader = sheet.getCell(3, 1);
  fixedHeader.value = "Equipment Data";
  fixedHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  fixedHeader.fill = solidFill("FF0B559F");
  fixedHeader.alignment = { horizontal: "center", vertical: "middle" };

  let monthStartIndex = 0;
  while (monthStartIndex < dates.length) {
    const month = dates[monthStartIndex].slice(0, 7);
    let monthEndIndex = monthStartIndex;
    while (monthEndIndex + 1 < dates.length && dates[monthEndIndex + 1].startsWith(month)) {
      monthEndIndex += 1;
    }

    const startColumn = fixedColumnCount + monthStartIndex + 1;
    const endColumn = fixedColumnCount + monthEndIndex + 1;
    sheet.mergeCells(3, startColumn, 3, endColumn);
    const cell = sheet.getCell(3, startColumn);
    cell.value = monthName(month);
    cell.font = { bold: true, color: { argb: "FF172033" } };
    cell.fill = solidFill("FFFFC000");
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder("FF7F7F7F");

    monthStartIndex = monthEndIndex + 1;
  }
  sheet.getRow(3).height = 22;
}

function addPlanDateHeader(sheet: ExcelJS.Worksheet, dates: string[], fixedColumnCount: number) {
  const headerRow = sheet.getRow(4);
  PLAN_FIXED_COLUMNS.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = solidFill("FF0B559F");
    cell.border = thinBorder();
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  dates.forEach((date, index) => {
    const cell = headerRow.getCell(fixedColumnCount + index + 1);
    cell.value = `${Number(date.slice(8, 10))}-${shortMonthName(date)}`;
    cell.font = { bold: true, size: 8, color: { argb: "FF172033" } };
    cell.fill = solidFill("FFF3F6FA");
    cell.border = thinBorder("FFC7D2DE");
    cell.alignment = { horizontal: "center", vertical: "middle", textRotation: 90 };
  });
  headerRow.height = 42;
}

function annualPlanRows(details: AnnualReportDetail[]) {
  const rows = new Map<string, { detail: AnnualReportDetail; workTypesByDate: Map<string, string[]> }>();

  for (const detail of details) {
    const key = JSON.stringify([
      detail.areaCode,
      detail.lineCode,
      detail.equipmentId,
      detail.equipmentCode,
      detail.equipmentName,
      detail.partDescription,
      detail.pointName,
      detail.materialName,
      detail.quantity ?? 0,
      detail.quantityUnit,
      detail.executionCondition,
    ]);
    const row = rows.get(key) ?? { detail, workTypesByDate: new Map<string, string[]>() };
    const current = row.workTypesByDate.get(detail.date) ?? [];
    if (!current.includes(detail.workTypeCode)) {
      current.push(detail.workTypeCode);
      current.sort((a, b) => (WORK_TYPE_SYMBOLS[a]?.priority ?? 100) - (WORK_TYPE_SYMBOLS[b]?.priority ?? 100));
      row.workTypesByDate.set(detail.date, current);
    }
    rows.set(key, row);
  }

  return Array.from(rows.values()).sort((a, b) => {
    return (
      a.detail.areaName.localeCompare(b.detail.areaName) ||
      a.detail.lineCode.localeCompare(b.detail.lineCode) ||
      a.detail.equipmentCode.localeCompare(b.detail.equipmentCode) ||
      a.detail.partDescription.localeCompare(b.detail.partDescription) ||
      a.detail.pointName.localeCompare(b.detail.pointName) ||
      a.detail.materialName.localeCompare(b.detail.materialName)
    );
  });
}

function yearDates(year: number) {
  const dates: string[] = [];
  for (let date = `${year}-01-01`; date <= `${year}-12-31`; date = addDateDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

function addDateDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monthName(month: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00.000Z`));
}

function shortMonthName(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`));
}

function materialKindLabel(value: string | null) {
  if (value === "oil") return "زيت";
  if (value === "grease") return "شحم";
  return value ?? "";
}

function stockStatusLabel(value: string | null) {
  if (value === "REORDER") return "إعادة طلب";
  if (value === "LOW") return "منخفض";
  if (value === "OK") return "جيد";
  return value ?? "";
}

function statusFillColor(value: string) {
  if (value === "إعادة طلب") return "FFF8CBAD";
  if (value === "منخفض") return "FFFFF2CC";
  return "FFE2F0D9";
}

function statusFontColor(value: string) {
  if (value === "إعادة طلب") return "FF9C0006";
  if (value === "منخفض") return "FF7F6000";
  return "FF006100";
}

function planSymbolFontColor(workTypes: string[]) {
  if (workTypes.length > 1) return "FF172033";
  return workTypes[0] === "oil_change" || workTypes[0] === "grease_change" ? "FFFFFFFF" : "FF172033";
}

function numberOrZero(value: number | string | null) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function solidFill(argb: string): ExcelJS.FillPattern {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(argb = "FFE2E8EF"): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb } },
    bottom: { style: "thin", color: { argb } },
    left: { style: "thin", color: { argb } },
    right: { style: "thin", color: { argb } },
  };
}

function validYear(value: string | null) {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return null;
  return year;
}

function validWorkType(value: string | null) {
  return ["inspection", "greasing", "oil_change", "grease_change"].includes(value ?? "") ? value : null;
}

function workTypeLabel(value: string) {
  if (value === "inspection") return "فحص";
  if (value === "greasing") return "إضافة شحم";
  if (value === "oil_change") return "تغيير زيت";
  if (value === "grease_change") return "تغيير شحم";
  return "كل أنواع العمل";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
