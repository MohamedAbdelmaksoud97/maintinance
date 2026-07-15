from __future__ import annotations

import os
import uuid
from datetime import date, timedelta
from typing import Any

import psycopg2
import psycopg2.extras

NAMESPACE = uuid.UUID("6255f571-6be7-4a31-8015-09694326f923")


def stable_id(*parts: Any) -> str:
    return str(uuid.uuid5(NAMESPACE, "|".join("" if part is None else str(part) for part in parts)))


def task_dates(plan_year: int, last_date: date | None, frequency_days: float | None) -> list[date]:
    if not last_date or not frequency_days or frequency_days <= 0:
        return []

    start = date(plan_year, 1, 1)
    end = date(plan_year, 12, 31)
    step = timedelta(days=max(1, int(round(frequency_days))))
    current = last_date
    while current < start:
        current = current + step

    dates: list[date] = []
    while current <= end:
        dates.append(current)
        current = current + step
    return dates


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")

    with psycopg2.connect(database_url, sslmode="require") as conn:
        with conn.cursor() as cur:
            cur.execute("select id from task_statuses where code = 'NEEDS_ASSIGNMENT'")
            status_id = cur.fetchone()[0]
            cur.execute("select id from assignment_statuses where code = 'UNASSIGNED'")
            assignment_status_id = cur.fetchone()[0]

            cur.execute(
                """
                select
                  api.id,
                  ap.plan_year,
                  mp.equipment_id,
                  api.maintenance_point_id,
                  mp.work_type_id,
                  mp.material_id,
                  mp.execution_condition,
                  api.planned_quantity,
                  api.planned_quantity_unit,
                  mp.frequency_days,
                  mp.frequency_hours,
                  mp.running_hours_per_day,
                  coalesce(mp.last_grease_date, mp.last_change_date, mp.last_inspection_date) as last_date,
                  api.original_values
                from annual_plan_items api
                join annual_plans ap on ap.id = api.annual_plan_id
                join maintenance_points mp on mp.id = api.maintenance_point_id
                """
            )

            tasks: list[tuple[Any, ...]] = []
            for row in cur.fetchall():
                (
                    item_id,
                    plan_year,
                    equipment_id,
                    maintenance_point_id,
                    work_type_id,
                    material_id,
                    execution_condition,
                    quantity,
                    quantity_unit,
                    frequency_days,
                    frequency_hours,
                    running_hours_per_day,
                    last_date,
                    original_values,
                ) = row

                effective_days = frequency_days
                if not effective_days and frequency_hours and running_hours_per_day:
                    effective_days = float(frequency_hours) / float(running_hours_per_day)

                for scheduled_date in task_dates(plan_year, last_date, effective_days):
                    task_id = stable_id("task", item_id, scheduled_date.isoformat())
                    tasks.append(
                        (
                            task_id,
                            item_id,
                            equipment_id,
                            maintenance_point_id,
                            work_type_id,
                            material_id,
                            status_id,
                            assignment_status_id,
                            scheduled_date,
                            scheduled_date,
                            execution_condition,
                            quantity,
                            quantity_unit,
                            psycopg2.extras.Json(original_values),
                        )
                    )

            psycopg2.extras.execute_values(
                cur,
                """
                insert into planned_tasks (
                  id, annual_plan_item_id, equipment_id, maintenance_point_id,
                  work_type_id, material_id, status_id, assignment_status_id,
                  original_due_date, scheduled_date, execution_condition,
                  planned_quantity, planned_quantity_unit, original_values
                )
                values %s
                on conflict (id) do update set updated_at = now()
                """,
                tasks,
                page_size=1000,
            )
            conn.commit()

    print({"planned_tasks": len(tasks), "assignment": "UNASSIGNED", "status": "NEEDS_ASSIGNMENT"})


if __name__ == "__main__":
    main()
