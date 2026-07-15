# Oil & Grease Maintenance Management System PRD

## Objective

Build a production-ready maintenance platform for Southern Province Cement Company that manages lubrication plans, assigned daily work, execution evidence, inventory, troubleshooting, cost control, and data quality using the real Excel workbooks as the migration source.

## Source Data Profile

The current import source contains 17 workbooks:

- Factory master workbook: oil master, grease master, historical operations, and auxiliary sheets.
- Annual lubrication plans for Crusher, Finish Mill, Klin, and Packhouse.
- Oil and grease plans for 2026 and 2027.

Initial inspection found:

- 4,970 annual maintenance input rows.
- 1,470 Crusher rows.
- 1,338 Finish Mill rows.
- 1,058 Klin rows.
- 1,104 Packhouse rows.
- 38 distinct oil labels.
- 13 distinct grease labels.
- 2,630 non-empty historical operation rows in the master workbook.

The annual workbooks include input sheets, calendar plan sheets, analysis sheets, monthly report sheets, and some `LAST` sheets. Klin files also include shutdown timing sheets.

## Roles

### Admin

Admins manage the full system:

- Users, workers, roles, and permissions.
- Areas, production lines, equipment, and maintenance points.
- Annual plans and generated task instances.
- Explicit assignment of every generated task to one main worker, with optional assistants.
- Reassignment and rescheduling, including complete history.
- Execution and non-execution report review.
- Oils, greases, suppliers, price history, stock limits, and transactions.
- Running and shutdown periods by production line.
- Dashboards for unassigned work, missed work, cost, stock, and worker performance.
- Excel import status and data quality resolution.

### Worker

Workers use a restricted daily-work interface:

- See only tasks assigned to them or tasks where they are assistants.
- Receive 9:00 AM notifications for assigned due tasks.
- Start and complete tasks.
- Enter actual oil or grease quantities.
- Upload required photos.
- Report discovered issues.
- Submit non-execution reports with reasons and evidence.
- Create troubleshooting reports outside the annual plan.

## Product Modules

- Authentication and role permissions.
- Worker management.
- Areas and production lines.
- Equipment and maintenance points.
- Materials: oils, greases, suppliers, prices, and stock settings.
- Inventory transaction ledger.
- Annual maintenance plans.
- Automatic task generation from plans.
- Individual assignment and bulk assignment.
- Daily worker task queue.
- Execution reports, non-execution reports, and images.
- Missed task detection and rescheduling.
- Troubleshooting and cost calculation.
- Daily notification queue.
- Admin dashboards and operational reports.
- Excel import and data quality.
- Audit logs.

## Non-Goals For Initial Foundation

- Do not invent equipment, workers, materials, prices, dates, or quantities missing from Excel.
- Do not auto-assign workers from area, equipment, or task type.
- Do not expose service-role keys or database passwords to the browser.
- Do not treat spreadsheet formulas as authoritative without preserving their original source row and derived value.

## Success Criteria

- Every imported row can be traced back to source workbook, sheet, row number, and original JSON values.
- Every generated annual task has an explicit assignment state.
- Unassigned tasks are visible to admins and invisible to workers.
- Workers cannot read or mutate other workers' tasks through Supabase RLS.
- Inventory stock is calculated from transactions, not overwritten totals.
- Material task cost uses the price valid at execution time.
- Missing, incomplete, duplicate, or invalid rows appear on a Data Quality page.

