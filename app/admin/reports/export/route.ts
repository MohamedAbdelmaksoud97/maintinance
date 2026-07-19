import ExcelJS from "exceljs";
import {
  buildAnnualMaintenanceReport,
  executionConditionLabel,
  loadAnnualReportLiveStatus,
  type AnnualReportLiveStatus,
  type AnnualReportSummary,
  type SupabaseLike,
} from "@/utils/annual-maintenance-report";
import { getSaudiToday } from "@/utils/operational-time";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const currentYear = Number(getSaudiToday().slice(0, 4));
  const year = validYear(url.searchParams.get("year")) ?? currentYear;
  const areaCode = url.searchParams.get("area")?.trim() || null;
  const workTypeCode = validWorkType(url.searchParams.get("workType"));
  const supabase = createClient(await cookies());
  const report = await buildAnnualMaintenanceReport(supabase as unknown as SupabaseLike, { year, areaCode, workTypeCode, includeLiveStatus: false });
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
