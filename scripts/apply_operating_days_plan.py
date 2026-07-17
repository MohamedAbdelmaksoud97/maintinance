from __future__ import annotations

import os
import sys
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg

from import_calculated_maintenance_plan import main as import_main


MIGRATION_PATH = Path("supabase/migrations/010_operating_days_maintenance_plan.sql")


def apply_migration(database_url: str) -> None:
    sql = MIGRATION_PATH.read_text(encoding="utf-8")
    with psycopg.connect(database_url) as conn:
        with conn.transaction():
            conn.execute(sql)


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply operating-days maintenance SQL and regenerate calculated tasks.")
    parser.add_argument("--as-of", default=datetime.now(timezone(timedelta(hours=3))).date().isoformat())
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")

    apply_migration(database_url)
    sys.argv = ["import_calculated_maintenance_plan.py", "--as-of", args.as_of, "--apply"]
    import_main()


if __name__ == "__main__":
    main()
