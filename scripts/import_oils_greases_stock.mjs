import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_FILE = "c:/Users/MF/Downloads/Telegram Desktop/OILS_GREASES_SAP_STOCK_ON_HAND.xlsx";
const STOCK_SOURCE_DATE = "2026-07-26";

function loadEnv() {
  try {
    const content = readFileSync(path.resolve(".env.local"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local is optional; regular environment variables work too.
  }
}

function text(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  if (!cleaned || cleaned === "—" || cleaned === "-") return null;
  return cleaned;
}

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function findOrCreateMaterial(supabase, row) {
  const originalValues = {
    usage_points: row.usagePoints,
    old_material_no: row.oldMaterialNo,
    sap_description: row.sapDescription,
    stock_source_date: STOCK_SOURCE_DATE,
  };
  const payload = {
    material_kind: row.kind,
    code: row.code,
    name: row.name,
    unit: row.unit,
    original_values: originalValues,
    data_quality_status: "COMPLETE",
    is_active: true,
  };

  if (row.code) {
    const { data: sameCode, error: sameCodeError } = await supabase
      .from("materials")
      .select("id,original_values")
      .eq("material_kind", row.kind)
      .eq("code", row.code)
      .maybeSingle();
    if (sameCodeError) throw sameCodeError;
    if (sameCode?.id) {
      const { error } = await supabase
        .from("materials")
        .update({
          ...payload,
          original_values: {
            ...((sameCode.original_values ?? {})),
            ...originalValues,
          },
        })
        .eq("id", sameCode.id);
      if (error) throw error;
      return sameCode.id;
    }
  }

  const { data: sameName, error: sameNameError } = await supabase
    .from("materials")
    .select("id,code,original_values")
    .eq("material_kind", row.kind)
    .eq("name", row.name)
    .limit(1)
    .maybeSingle();
  if (sameNameError) throw sameNameError;

  if (sameName?.id && (!sameName.code || sameName.code === row.code || /^(oil|grease)-/i.test(sameName.code))) {
    const { error } = await supabase
      .from("materials")
      .update({
        ...payload,
        original_values: {
          ...((sameName.original_values ?? {})),
          ...originalValues,
        },
      })
      .eq("id", sameName.id);
    if (error) throw error;
    return sameName.id;
  }

  if (row.code) {
    const { data, error } = await supabase
      .from("materials")
      .upsert(payload, { onConflict: "material_kind,code" })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  const { data: existing, error: lookupError } = await supabase
    .from("materials")
    .select("id,original_values")
    .eq("material_kind", row.kind)
    .eq("name", row.name)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { error } = await supabase
      .from("materials")
      .update({
        unit: row.unit,
        original_values: {
          ...((existing.original_values ?? {})),
          ...originalValues,
        },
        data_quality_status: "COMPLETE",
        is_active: true,
      })
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase.from("materials").insert(payload).select("id").single();
  if (error) throw error;
  return data.id;
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const filePath = process.argv.find((arg) => !arg.startsWith("--") && arg !== process.argv[0] && arg !== process.argv[1]) ?? DEFAULT_FILE;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!dryRun && (!supabaseUrl || !serviceKey)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet("Oils & Greases");
  if (!sheet) throw new Error("Sheet 'Oils & Greases' was not found.");

  const supabase = dryRun
    ? null
    : createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
  const rows = [];

  for (let rowNumber = 4; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber).values;
    const type = text(row[2]);
    if (type !== "Oil" && type !== "Grease") continue;

    const name = text(row[3]);
    if (!name) continue;

    rows.push({
      rowNumber,
      kind: type === "Grease" ? "grease" : "oil",
      name,
      usagePoints: number(row[4]),
      code: text(row[5]),
      oldMaterialNo: text(row[6]),
      sapDescription: text(row[7]),
      stock: number(row[8]),
      unit: text(row[9]) ?? (type === "Grease" ? "KG" : "L"),
    });
  }

  let materialCount = 0;
  let transactionCount = 0;

  for (const row of rows) {
    if (dryRun) {
      materialCount += 1;
      transactionCount += 1;
      continue;
    }

    const materialId = await findOrCreateMaterial(supabase, row);
    materialCount += 1;

    const sourceKey = `opening:sap:${STOCK_SOURCE_DATE}:${row.code ?? `${row.kind}:${row.name}`}`;
    const { error } = await supabase.from("inventory_transactions").upsert(
      {
        material_id: materialId,
        transaction_type: "opening",
        quantity: row.stock,
        unit: row.unit,
        transaction_date: `${STOCK_SOURCE_DATE}T00:00:00+03:00`,
        source_type: "sap_stock_on_hand",
        source_key: sourceKey,
        notes: `SAP stock on hand import row ${row.rowNumber}`,
      },
      { onConflict: "source_key" },
    );
    if (error) throw error;
    transactionCount += 1;
  }

  console.log(JSON.stringify({ dryRun, filePath, materials: materialCount, openingTransactions: transactionCount }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
