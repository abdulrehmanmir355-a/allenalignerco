# Employee daily work reporting

The employee portal (`/employee`) and HR work workspace (`/hr/performance`) are separate role-specific pages. They share the authorized work API and PostgreSQL records, but each page has its own landing view and navigation. Signing in with an HR account opens the HR workspace; signing in as an employee opens the private employee workspace.

## Where work is stored

- HR task assignments are stored in PostgreSQL `WorkTask` and appear under **Employee Portal → My Assigned Tasks**.
- An employee enters the day's work under **Employee Portal → Submit Daily Work**. Saving creates or updates that employee's `WorkReport` draft for the reporting date.
- The employee then submits the draft from **My Daily Reports**. Its status becomes `SUBMITTED`, an audit event is appended to `WorkAudit`, and in-app notifications are sent to the assigned manager and all active HR Admins and HR Officers.
- HR reviews the report from **HR Management → Work & Performance → Team Reports**. Performance views include filters for employee name/ID and department; selecting a result's detailed report shows the work, completed and pending items, time, blockers, status, and review history.

## Visibility and permissions

- Employee and Manager accounts can retrieve only their own profile, tasks, reports, evaluations, notifications, and related records. The employee ID scope is enforced in server-side database queries, not only in the page.
- HR Admins and HR Officers can search and read organization-wide employee work and performance records. HR can assign work to active employees.
- Existing per-employee HR grants continue to control report review and evaluation actions for HR Officers. Manager accounts use the private employee workspace and do not see other employees' records.
- Employee contact details are returned only for the signed-in employee's own profile; they are omitted from the organization-wide work list.

## Database repair

The additive migration `database/migrations/20261027191000_employee_work_reporting_fields.sql` supplies the daily-work form fields missing from the local schema (`workStartTime`, `taskStatus`, and `blockers`). The backup-first command is `node scripts/work-reporting-migrate.cjs` (also available as `db:work-reporting`). It validates a PostgreSQL dump before applying the migration and checks that existing work-report row counts remain unchanged.

At the time of the repair, the local database contained no daily work reports or assigned tasks. Previously, saving a daily report attempted to update the three absent columns, causing the entire transaction—including the draft insert—to roll back. After the migration, new entries persist normally; existing employee and case records are not recreated or changed.
