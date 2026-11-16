> Historical implementation notes. For the current direct PostgreSQL setup, see [DATABASE-CONNECTION.md](DATABASE-CONNECTION.md). Do not run the old Prisma commands below.

# Module 04 Patient Master — Phase 2

Implemented 2026-10-19 in the existing Windows project. Phase 1 was already applied: all four migrations are up to date, Prisma schema validates, and all 11 transaction-only patient integrity checks pass. No schema or migration changes were needed.

## Working increment

- `GET /api/clinic/patients?page=1`: authenticated, active clinic patients only, 50 per page, count and deterministic ordering. Explicit minimal field selection excludes clinical histories and doctor case details.
- `POST /api/clinic/patients`: existing `apiDoctor` verifies session, verification status, clinic membership and same-origin writes. Ownership comes from the session; strict validation rejects submitted clinic IDs and other unsupported properties.
- Clinic staff enter a stable patient code; the server canonicalizes it to uppercase. PostgreSQL's existing clinic/code unique constraint protects repeated requests and concurrent submissions, returning 409. Codes are not generated from counts.
- Names, dates and contact details are validated and normalized. Impossible/future birth dates are rejected. Dates are stored as UTC date values.
- `/clinic/patients` now loads and saves actual database records. Includes loading, empty, retry, pagination, save progress, success and error states. Failed saves preserve the form. Demo patients, assigned doctors, fake case IDs and treatment metrics were removed from this page.
- All API responses are non-cacheable. The existing clinic layout remains protected. Doctor authentication and doctor-specific case permissions are unchanged.

## Verification

Run from the existing project directory:

```powershell
node node_modules/prisma/build/index.js migrate status --config prisma7.config.ts
node node_modules/prisma/build/index.js validate --config prisma7.config.ts
node scripts/patient-integrity.cjs
node --experimental-strip-types --test scripts/portal-unit.test.cjs scripts/patient-unit.test.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js
node node_modules/next/dist/bin/next build
```

All passed: 11 integrity checks, 6 unit tests, TypeScript, full ESLint and production build. An initial TypeScript invocation overlapped route-type generation during the build; the independent rerun after the build passed.

With the production server running at `http://127.0.0.1:3107` and `APP_ORIGIN` set to that origin:

```powershell
node scripts/patient-integration.cjs
node scripts/portal-integration.cjs
```

All 23 patient integration checks and all 52 existing portal integration checks passed against the configured local PostgreSQL-compatible PGlite instance at localhost:51218. These scripts reject other database hosts/ports. They use unique synthetic clinics/doctors and clean up their fixtures in finally. Integrity fixtures are rolled back. Existing records were not deliberately changed, reset or migrated by this increment. No DB tests were blocked. This does not establish compatibility against a separate production PostgreSQL installation. Interactive browser form submission was not exercised in this increment.

## Deliberate limits / next step

Duplicate protection currently means the same canonical code within a clinic, including simultaneous requests. Different codes can represent the same person. Names, family phone numbers and emails are not unique. Next: clinic-scoped search and possible-duplicate warnings using normalized identity fields, with explicit user review rather than automatic merging. After that: editing with revision conflict checks and append-only audit history, archive, and authorized patient/case linkage. Existing legacy case references remain unchanged.

This folder is not a Git repository. The previous patient page was backed up in the Codex task workspace before replacement. Files changed in this increment: `app/lib/patient-validation.ts`, `app/api/clinic/patients/route.ts`, `app/clinic/patients/page.tsx`, `scripts/patient-unit.test.cjs`, `scripts/patient-integration.cjs`, and this document.

## Shared clinic Patient Master follow-up — 2026-11-05

- The clinic side menu's Patient Master entry opens the shared patient records workflow used by doctors; the former disconnected page redirects to that route. The doctor's workspace sidebar also has a Patient Master link.
- Patient list, create, edit, and history endpoints accept either a verified doctor session or an active clinic user with patient-access permission. Clinic IDs come from the authenticated session. Clinic viewers remain read-only; clinic staff/admin changes are attributed to their ClinicUser account.
- The editor captures clinical notes, medical history, and dental history. These fields are included in patient change snapshots and returned only by the single-patient endpoint, not the list endpoint.
- Patient detail history includes linked cases and clinic case timelines. The doctor patient screen does not expose clinic-only case timelines, preserving existing doctor case ownership checks.
- Apply `database/migrations/20261105110000_patient_history_clinic_actor.sql` to the local PostgreSQL database before using clinic-user create/edit/history APIs. It adds nullable clinic-user attribution to PatientHistory and preserves existing rows. The migration has not been applied automatically.
