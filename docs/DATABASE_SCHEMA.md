# Database Schema

The first schema migration is in `supabase/migrations/001_maintenance_core.sql`.

## Design Principles

- Operational values are dynamic database records. Equipment, workers, materials, frequencies, task statuses, work types, and prices are not hard-coded in the frontend.
- Annual plan imports are separated from generated task instances.
- Raw Excel rows are preserved in import tables before normalization.
- Worker visibility is enforced by RLS, not by frontend filtering alone.
- Inventory stock is ledger-based.
- Reassignment, rescheduling, and import quality decisions are append-only history.

## Core Tables

- `profiles`: Supabase Auth user profile and role.
- `workers`: worker-specific operational details.
- `areas`: plant areas such as Crusher, Finish Mill, Klin, and Packhouse.
- `production_lines`: line numbers within an area.
- `equipment`: imported and editable equipment.
- `maintenance_points`: lubrication/inspection point definitions.
- `maintenance_work_types`: dynamic task types.
- `task_statuses`: dynamic task statuses.
- `assignment_statuses`: dynamic assignment states.
- `materials`: oil and grease material catalog.
- `material_prices`: price history.
- `inventory_transactions`: stock ledger.
- `annual_plans`: annual plan header per area/material/year/source.
- `annual_plan_items`: normalized plan rows.
- `planned_tasks`: generated individual tasks.
- `task_assistants`: optional assisting workers.
- `task_assignment_history`: assignment audit.
- `task_reschedules`: reschedule audit.
- `execution_reports`: completed planned work reports.
- `report_materials`: actual material usage and execution-time price.
- `non_execution_reports`: missed/cannot-complete reports.
- `troubleshooting_reports`: unplanned work.
- `troubleshooting_assignees`: workers attached to troubleshooting.
- `troubleshooting_materials`: troubleshooting material usage.
- `production_periods`: running and shutdown windows.
- `notification_queue`: daily notification queue.
- `import_batches`, `import_files`, `imported_rows`, `data_quality_issues`: Excel import and quality workflow.
- `audit_logs`: application audit trail.

## RLS Model

- Helper functions live in `app_private`, not `public`.
- Authenticated admins can read and manage all operational tables.
- Workers can read their own profile and worker record.
- Workers can read planned tasks where they are the main worker or an assistant.
- Workers can submit execution and non-execution reports only for tasks assigned to them.
- Unassigned tasks are visible to admins only.

## Import Strategy

1. Create an import batch.
2. Register each source workbook in `import_files`.
3. Insert every non-empty row into `imported_rows` with original JSON.
4. Normalize areas, production lines, equipment, materials, maintenance points, plans, and plan items.
5. Create `data_quality_issues` for missing equipment code, missing material, missing frequency/date/quantity, duplicate names, and formula-derived ambiguity.
6. Generate `planned_tasks` only when a concrete plan date is known.
7. Set imported generated tasks to `NEEDS_ASSIGNMENT` and `UNASSIGNED` unless a real employee is explicitly present in source data or assigned by an admin.

## Current Excel Mapping Notes

- Annual input sheets use row 3 as the header.
- Grease input columns include equipment code, equipment name, part/description, line, lubrication point, grease type, running hours per day, change frequency hours, quantity grams, last change date, grease frequency days, and last grease date.
- Oil input columns include equipment code, equipment name, part/description, line, oil type, oil capacity liters, running hours per day, change frequency hours, inspection frequency days, last change date, last inspection date, and related calculated fields.
- Calendar plan sheets are wide date grids and should be parsed into task instances only after validating date headers and task symbols.
- Monthly report sheets contain execution/reporting views and should be imported as historical/report source rows before normalization.
- Master history contains historical operation rows with user, work type, line, equipment code/name, description, material, required quantity, top-up, unit, parts, date, and notes.

