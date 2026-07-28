/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");
const ExcelJS = require("exceljs");

const DEFAULT_FILE = "c:/Users/MF/Downloads/Telegram Desktop/OILS_GREASES_SAP_STOCK_ON_HAND.xlsx";
const STOCK_SOURCE_DATE = "2026-07-26";

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

async function findOrCreateMaterial(client, row) {
  const originalValues = {
    usage_points: row.usagePoints,
    old_material_no: row.oldMaterialNo,
    sap_description: row.sapDescription,
    stock_source_date: STOCK_SOURCE_DATE,
  };

  if (row.code) {
    const sameCode = await client.query(
      "select id from materials where material_kind = $1 and code = $2 limit 1",
      [row.kind, row.code],
    );
    if (sameCode.rows[0]?.id) {
      await client.query(
        `update materials
         set name = $2,
             unit = $3,
             original_values = coalesce(original_values, '{}'::jsonb) || $4::jsonb,
             data_quality_status = 'COMPLETE',
             is_active = true,
             updated_at = now()
         where id = $1`,
        [sameCode.rows[0].id, row.name, row.unit, JSON.stringify(originalValues)],
      );
      return sameCode.rows[0].id;
    }
  }

  const sameName = await client.query(
    "select id, code from materials where material_kind = $1 and name = $2 limit 1",
    [row.kind, row.name],
  );
  if (sameName.rows[0]?.id && (!sameName.rows[0].code || sameName.rows[0].code === row.code || /^(oil|grease)-/i.test(sameName.rows[0].code))) {
    await client.query(
      `update materials
       set code = $2,
           name = $3,
           unit = $4,
           original_values = coalesce(original_values, '{}'::jsonb) || $5::jsonb,
           data_quality_status = 'COMPLETE',
           is_active = true,
           updated_at = now()
       where id = $1`,
      [sameName.rows[0].id, row.code, row.name, row.unit, JSON.stringify(originalValues)],
    );
    return sameName.rows[0].id;
  }

  if (row.code) {
    const result = await client.query(
      `insert into materials (material_kind, code, name, unit, original_values, data_quality_status, is_active)
       values ($1, $2, $3, $4, $5::jsonb, 'COMPLETE', true)
       on conflict (material_kind, code) do update
       set name = excluded.name,
           unit = excluded.unit,
           original_values = coalesce(materials.original_values, '{}'::jsonb) || excluded.original_values,
           data_quality_status = 'COMPLETE',
           is_active = true,
           updated_at = now()
       returning id`,
      [row.kind, row.code, row.name, row.unit, JSON.stringify(originalValues)],
    );
    return result.rows[0].id;
  }

  const existing = await client.query(
    "select id from materials where material_kind = $1 and name = $2 limit 1",
    [row.kind, row.name],
  );
  if (existing.rows[0]?.id) {
    await client.query(
      `update materials
       set unit = $2,
           original_values = coalesce(original_values, '{}'::jsonb) || $3::jsonb,
           data_quality_status = 'COMPLETE',
           is_active = true,
           updated_at = now()
       where id = $1`,
      [existing.rows[0].id, row.unit, JSON.stringify(originalValues)],
    );
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `insert into materials (material_kind, name, unit, original_values, data_quality_status, is_active)
     values ($1, $2, $3, $4::jsonb, 'COMPLETE', true)
     returning id`,
    [row.kind, row.name, row.unit, JSON.stringify(originalValues)],
  );
  return inserted.rows[0].id;
}

async function readRows(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet("Oils & Greases");
  if (!sheet) throw new Error("Sheet Oils & Greases was not found.");

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
  return rows;
}

async function main() {
  const filePath = process.argv[2] ?? DEFAULT_FILE;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");

  const rows = await readRows(filePath);
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let materials = 0;
  let insertedOpenings = 0;
  await client.query("begin");
  try {
    for (const row of rows) {
      const materialId = await findOrCreateMaterial(client, row);
      materials += 1;
      const sourceKey = `opening:sap:${STOCK_SOURCE_DATE}:${row.code ?? `${row.kind}:${row.name}`}`;
      const opening = await client.query(
        `insert into inventory_transactions (material_id, transaction_type, quantity, unit, transaction_date, source_type, source_key, notes)
         values ($1, 'opening', $2, $3, $4::timestamptz, 'sap_stock_on_hand', $5, $6)
         on conflict (source_key) do nothing
         returning id`,
        [materialId, row.stock, row.unit, `${STOCK_SOURCE_DATE}T00:00:00+03:00`, sourceKey, `SAP stock on hand import row ${row.rowNumber}`],
      );
      insertedOpenings += opening.rowCount;
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  const summary = await client.query(`
    select material_kind, count(*)::int as count, coalesce(sum(stock_quantity), 0)::numeric as stock
    from material_stock
    where material_kind in ('oil', 'grease')
    group by material_kind
    order by material_kind
  `);
  console.log(JSON.stringify({ parsedRows: rows.length, materialsUpserted: materials, openingTransactionsInserted: insertedOpenings, stockSummary: summary.rows }, null, 2));
  await client.end();
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
