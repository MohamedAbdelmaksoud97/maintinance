# Business Rules

## Task Assignment

- Every task generated from an annual plan must store its own final assignment.
- The system must never infer a worker from equipment, area, production line, or task type.
- If no main worker has been assigned, the task status is `NEEDS_ASSIGNMENT` and the assignment status is `UNASSIGNED`.
- Unassigned tasks are shown prominently on admin dashboards.
- Unassigned tasks are not shown in worker daily queues and are not sent as worker notifications.
- Admins may assign tasks one by one or in bulk, but each resulting task row stores its own `main_worker_id`.
- Every assignment and reassignment creates an assignment history row with previous worker, new worker, assigned by, timestamp, and reason.
- A task may have one main worker and many assisting workers.

## Execution Conditions

- Greasing is normally performed while equipment is running.
- Oil changes are normally performed during shutdown.
- Inspections are normally performed while equipment is running.
- Execution condition is configurable on each maintenance point and is copied to generated tasks.
- Supported maintenance work includes inspection, oil change, greasing, cleaning, planned maintenance, and troubleshooting.

## Task Lifecycle

- Generated tasks start as `NEEDS_ASSIGNMENT` when no worker is selected.
- Assigned future tasks move to an assignable planned status.
- A worker may start only assigned tasks.
- A worker may complete only tasks assigned to them as main worker or assistant.
- If a due task expires without completion, it is marked `MISSED`.
- Admins can reschedule missed tasks.
- Workers can submit non-execution reports for assigned tasks they cannot complete.
- Rescheduling preserves original due date and every later scheduled date.

## Inventory

- Oils and greases are editable material records, not hard-coded lists.
- Materials store code, name, brand, grade, unit, supplier, minimum stock, and reorder level when known.
- Prices are stored as history records with effective dates.
- Current stock is calculated from approved inventory transactions.
- Planned execution and troubleshooting reports create consumption transactions after approval.
- Task material cost uses the material price effective at execution time.

## Troubleshooting

- Troubleshooting reports record equipment, maintenance point if known, issue, priority, assigned workers, start time, end time, overtime, materials, quantities, photos, additional expenses, result, and approval status.
- Troubleshooting cost includes material consumption, overtime labor, and additional expenses.
- Reports must support planned versus unplanned maintenance cost analysis.

## Excel Import And Data Quality

- Import all provided Excel rows without inventing missing values.
- Preserve source workbook, sheet, row number, and original row JSON.
- Normalize obvious duplicate names only when source values remain traceable.
- Mark records as `COMPLETE`, `MISSING_DATA`, `NEEDS_REVIEW`, or `INVALID`.
- Imported annual-plan tasks with no employee remain `UNASSIGNED`.
- Data Quality records must be editable later by admins through the UI.
- All import writes create audit records or import row records sufficient to reconstruct the source.

## Security

- Admins can manage all operational records.
- Workers can read only tasks assigned to them as main or assistant.
- Workers can create or edit only permitted reports linked to their assignments.
- Public client code may use only publishable Supabase keys.
- Privileged operations must run server-side or through database policies/functions.
- Images are stored in Supabase Storage with policies scoped to role and ownership.

