from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any

import openpyxl
import psycopg2
import psycopg2.extras


ROOT = Path(r"f:\lubrication")
PLAN_ROOT = ROOT / "LUBRICTION PLAN 2026+2027"


@dataclass(frozen=True)
class WorkbookSource:
    path: Path
    source_kind: str
    area: str | None
    material_kind: str | None
    plan_year: int | None


def clean_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, time):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return value


def row_to_json(headers: list[str | None], row: tuple[Any, ...]) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for index, value in enumerate(row):
        header = headers[index] if index < len(headers) and headers[index] else f"col_{index + 1}"
        values[str(header)] = clean_value(value)
    return values


def discover_sources() -> list[WorkbookSource]:
    master = next(ROOT.glob("Factory Maintenance System*Master*.xlsx"))
    sources = [WorkbookSource(master, "master", None, None, None)]

    for path in sorted(PLAN_ROOT.glob("* AREA/*.xlsx")):
        year_match = re.search(r"(20\d{2})", path.name)
        area = path.parent.name.replace(" AREA", "")
        material_kind = "grease" if "GREASE" in path.name.upper() else "oil"
        sources.append(
            WorkbookSource(
                path=path,
                source_kind="annual_plan",
                area=area,
                material_kind=material_kind,
                plan_year=int(year_match.group(1)) if year_match else None,
            )
        )
    return sources


def quality_status(source_kind: str, row_data: dict[str, Any]) -> str:
    if not any(value is not None for value in row_data.values()):
        return "INVALID"
    if source_kind == "annual_plan":
        values = list(row_data.values())
        required = values[:2]
        if any(value is None for value in required):
            return "MISSING_DATA"
        if any(isinstance(value, str) and value.startswith("=") for value in row_data.values()):
            return "NEEDS_REVIEW"
    return "COMPLETE"


def ensure_seed_data(cur: psycopg2.extensions.cursor) -> None:
    for code, name in [
        ("inspection", "Inspection"),
        ("oil_change", "Oil change"),
        ("greasing", "Greasing"),
        ("cleaning", "Cleaning"),
        ("planned_maintenance", "Planned maintenance"),
        ("troubleshooting", "Troubleshooting"),
    ]:
        cur.execute(
            "insert into maintenance_work_types (code, name) values (%s, %s) on conflict (code) do nothing",
            (code, name),
        )

    for code, name, is_terminal in [
        ("NEEDS_ASSIGNMENT", "Needs assignment", False),
        ("PLANNED", "Planned", False),
        ("IN_PROGRESS", "In progress", False),
        ("COMPLETED", "Completed", True),
        ("MISSED", "Missed", True),
        ("CANCELLED", "Cancelled", True),
    ]:
        cur.execute(
            "insert into task_statuses (code, name, is_terminal) values (%s, %s, %s) on conflict (code) do nothing",
            (code, name, is_terminal),
        )

    for code, name in [("UNASSIGNED", "Unassigned"), ("ASSIGNED", "Assigned"), ("REASSIGNED", "Reassigned")]:
        cur.execute(
            "insert into assignment_statuses (code, name) values (%s, %s) on conflict (code) do nothing",
            (code, name),
        )


def import_workbook(
    conn: psycopg2.extensions.connection,
    cur: psycopg2.extensions.cursor,
    batch_id: str,
    source: WorkbookSource,
) -> None:
    workbook = openpyxl.load_workbook(source.path, read_only=True, data_only=True)
    cur.execute(
        """
        insert into import_files (batch_id, source_path, source_name, source_kind, area_name, material_kind, plan_year, sheet_count)
        values (%s, %s, %s, %s, %s, %s, %s, %s)
        returning id
        """,
        (
            batch_id,
            str(source.path),
            source.path.name,
            source.source_kind,
            source.area,
            source.material_kind,
            source.plan_year,
            len(workbook.worksheets),
        ),
    )
    import_file_id = cur.fetchone()[0]
    conn.commit()

    pending_rows: list[tuple[Any, ...]] = []

    def flush_pending() -> None:
        if not pending_rows:
            return
        psycopg2.extras.execute_values(
            cur,
            """
            insert into imported_rows (
              batch_id, import_file_id, sheet_name, sheet_index, row_number,
              row_data, quality_status
            )
            values %s
            """,
            pending_rows,
            template="(%s, %s, %s, %s, %s, %s::jsonb, %s)",
            page_size=500,
        )
        pending_rows.clear()
        conn.commit()

    for sheet_index, sheet in enumerate(workbook.worksheets):
        if source.source_kind == "annual_plan" and ("مدخلات" in sheet.title or sheet_index in (0, 1)):
            header_row_number = 3
        else:
            header_row_number = 1

        rows = sheet.iter_rows(values_only=True)
        headers: list[str | None] = []
        for row_number, row in enumerate(rows, start=1):
            if row_number == header_row_number:
                headers = [clean_value(value) for value in row]
                continue
            if not any(value is not None for value in row):
                continue
            row_data = row_to_json(headers, row)
            status = quality_status(source.source_kind, row_data)
            pending_rows.append(
                (
                  batch_id,
                  import_file_id,
                  sheet.title,
                  sheet_index,
                  row_number,
                  json.dumps(row_data, ensure_ascii=False),
                  status,
                )
            )
            if len(pending_rows) >= 500:
                flush_pending()

    flush_pending()
    cur.execute("update import_files set completed_at = now() where id = %s", (import_file_id,))
    conn.commit()
    workbook.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Import SPCC lubrication Excel workbooks into Supabase staging tables.")
    parser.add_argument("--label", default="initial-excel-import", help="Import batch label")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")

    sources = discover_sources()
    with psycopg2.connect(database_url, sslmode="require") as conn:
        with conn.cursor() as cur:
            ensure_seed_data(cur)
            cur.execute(
                """
                select id
                from import_batches
                where label = %s
                  and completed_at is null
                order by started_at desc
                limit 1
                """,
                (args.label,),
            )
            existing_batch = cur.fetchone()
            if existing_batch:
                batch_id = existing_batch[0]
            else:
                cur.execute("insert into import_batches (label, source_root) values (%s, %s) returning id", (args.label, str(ROOT)))
                batch_id = cur.fetchone()[0]
            conn.commit()

            for source in sources:
                cur.execute(
                    """
                    delete from import_files
                    where batch_id = %s
                      and source_path = %s
                      and completed_at is null
                    """,
                    (batch_id, str(source.path)),
                )
                conn.commit()

                cur.execute(
                    "select 1 from import_files where batch_id = %s and source_path = %s and completed_at is not null",
                    (batch_id, str(source.path)),
                )
                if cur.fetchone():
                    continue
                import_workbook(conn, cur, batch_id, source)

            cur.execute(
                """
                update import_batches
                set completed_at = now(),
                    summary = (
                      select jsonb_build_object(
                        'files', count(distinct import_file_id),
                        'rows', count(*),
                        'complete', count(*) filter (where quality_status = 'COMPLETE'),
                        'missing_data', count(*) filter (where quality_status = 'MISSING_DATA'),
                        'needs_review', count(*) filter (where quality_status = 'NEEDS_REVIEW'),
                        'invalid', count(*) filter (where quality_status = 'INVALID')
                      )
                      from imported_rows
                      where batch_id = %s
                    )
                where id = %s
                """,
                (batch_id, batch_id),
            )
            conn.commit()
            print(batch_id)


if __name__ == "__main__":
    main()
