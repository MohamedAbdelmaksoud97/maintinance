import ExcelJS from "exceljs";
import { buildAnnualMaintenanceReport, executionConditionLabel, type SupabaseLike } from "@/utils/annual-maintenance-report";
import { getSaudiToday } from "@/utils/operational-time";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const currentYear = Number(getSaudiToday().slice(0, 4));
  const year = validYear(url.searchParams.get("year")) ?? currentYear;
  const areaCode = url.searchParams.get("area")?.trim() || null;
  const supabase = createClient(await cookies());
  const report = await buildAnnualMaintenanceReport(supabase as unknown as SupabaseLike, { year, areaCode });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SPCC Maintenance System";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Daily Summary", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  summarySheet.columns = [
    { header: "التاريخ", key: "date", width: 14 },
    { header: "اليوم", key: "dayName", width: 14 },
    { header: "معدات مطلوبة", key: "equipmentCount", width: 16 },
    { header: "أعمال داخلية", key: "internalTaskCount", width: 16 },
    { header: "فحص", key: "inspectionCount", width: 12 },
    { header: "إضافة شحم", key: "greasingCount", width: 14 },
    { header: "تغيير زيت", key: "oilChangeCount", width: 14 },
    { header: "تغيير شحم", key: "greaseChangeCount", width: 14 },
  ];
  summarySheet.addRows(report.days);
  styleWorksheet(summarySheet);

  const detailsSheet = workbook.addWorksheet("Task Details", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
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

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `annual-maintenance-plan-${report.year}${areaCode ? `-${areaCode}` : ""}.xlsx`;

  return new Response(buffer as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function styleWorksheet(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B559F" } };
  header.alignment = { horizontal: "center", vertical: "middle" };
  header.height = 22;

  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8EF" } },
        bottom: { style: "thin", color: { argb: "FFE2E8EF" } },
        left: { style: "thin", color: { argb: "FFE2E8EF" } },
        right: { style: "thin", color: { argb: "FFE2E8EF" } },
      };
    });
    if (rowNumber > 1 && rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    }
  });

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
