# Internal Clinical Review

This module is Allen Aligner's internal clinical team, separate from Clinic Team. It reuses WorkAccount/WorkSession/Employee authentication, PortalCase, TreatmentPlan, CaseFile, LargeClinicalFile, and existing case events, messages and notifications.

Apply database/migrations/20261022180000_internal_clinical_review.sql once before running the updated application. It adds WorkAccount.clinicalRole plus ClinicalReview and ClinicalReviewAudit; no patient or employee data is replaced. It queues existing plans without marking any approved. Back up the database before production deployment.

Bootstrap an explicitly authorized active employee with `node scripts/clinical-admin.cjs AA-EMP-000001 ADMIN "Authorization reason"`. No account is granted access automatically. Employees sign in at /employee/login and must finish the existing password-change requirement. Administrators manage grants at /clinical; reviewers and leads require verified qualifications. Administrators can assign but cannot make clinical decisions. A lead can take over escalations. Deactivated accounts lose access immediately.

Lab submission creates an immutable plan version and pending review. The case stays in existing PLANNING until the assigned reviewer completes the checklist and approves; then REVIEW releases the plan to the doctor. Revision and missing-information returns use CHANGES_REQUESTED; lab submission creates a new version and new pending review. The doctor still has to approve before APPROVED and production. Old approvals do not cover new versions. No automatic clinical decisions are made.

Every review change is captured by an append-only database audit trigger, including checklist snapshots, actor identity, reasons, assignment and timestamps. Mutations lock the case then the review and compare the caller's review revision. New lab and doctor mutations follow the same case-lock order. Plan content cannot be changed in place. Release and doctor-decision triggers enforce the clinical gate even if a caller bypasses the UI.

Routes: /clinical, /clinical/cases/[id], GET /api/clinical/reviews, GET/POST /api/clinical/cases/[id], POST /api/clinical/team, GET /api/clinical/cases/[id]/files/[kind]/[fileId]. All file requests recheck role and case access. Images/PDFs use a secure browser preview; STL/scan files download for clinical software. No 3D treatment simulation is implemented. Existing large-file storage is development-only and requires a production private object-storage adapter before production deployment.

## Doctor-started case assignment

Doctor ownership remains tied to the verified doctor who created the case. A separate communication assignment does not transfer doctor ownership or clinical approval authority. After a doctor sends a message on a submitted case, it appears in the Leader Case Assignments page at `/clinical/leader`. A Clinical Lead or administrator assigns an active, employee-linked Reviewer or Lead and records the reason; reassignment remains available to Leads/Admins. Only accounts linked to an active employee appear in the assignment selector, so an assignment cannot silently land on a standalone clinical account with no employee workspace. Assigned cases appear under `/employee` → **My Assigned Cases** with a direct conversation link. Assignment actions are revision-checked, case-locked, and retained in immutable `ClinicalCaseAssignmentAudit` history. Both the doctor and assignee receive notifications. The assignee gains access to the case conversation and can reply to shared doctor messages; private/internal-only messages remain protected. Apply `database/migrations/20261107120000_clinical_case_assignment.sql` to the local development database before running the updated application.

The application is intended to run only on localhost. `npm run dev` and `npm run dev:local` bind to `127.0.0.1`; this workflow is not configured for hosted deployment.

Completed dashboard history shows the most recent 200 reviews; each case retains its complete review audit. Turnaround measures queue-to-decision hours, or elapsed hours for open reviews. Cases without plans remain in the existing lab workflow.

Validation: `node --experimental-strip-types --test scripts/clinical-unit.test.cjs scripts/portal-unit.test.cjs`. Integration tests require a separate schema-only database named allen_aligner_clinical_test_20261022 with this migration applied, a local Next.js server on 127.0.0.1:3119 using that database, and CLINICAL_TEST_DATABASE_URL set to the same database. Run `node scripts/clinical-integration.cjs`. Tests use only synthetic records and retain them in that isolated database because audit and identity records are immutable. Never run fixture tests against the live database.

## Internal registration and login

Apply 20261022190000_clinical_registration.sql after the original clinical migration. It adds WorkAccount.clinicalRequest only. /clinical/login and /clinical/register reuse /api/work/auth, the existing password hashes and WorkSession cookie. They do not create another authentication system or employee identity.

Registration is an access request by an authenticated active employee with an already changed password. A reviewer or lead role is requested with qualification details. The administrator sees pending requests on /clinical and records approval or rejection with a reason. All requests and decisions are recorded in ClinicalReviewAudit. Concurrent decisions and stale request IDs are rejected. Pending requests grant no clinical access. Existing staff registration/activation remains in HR and employee management; new staff need that process before requesting clinical access. The first clinical administrator remains explicitly provisioned using clinical-admin.cjs.

GET /api/clinical/registration returns only the current employee's role/request. POST accepts request or administrator decide actions. The dashboard includes pending requests only for clinical administrators. Direct permission changes cancel any pending request and preserve it in audit. Clinical logout uses the existing employee-session logout endpoint.

Run scripts/clinical-registration-integration.cjs with CLINICAL_TEST_DATABASE_URL pointing to the isolated clinical test database and the server at 127.0.0.1:3119, after both migrations. It checks registration, authorization, decisions, concurrency, audit and logout.
