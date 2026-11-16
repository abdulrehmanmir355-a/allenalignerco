# Module 04 Patient Master — archive and record integrity

Completion increment for the PDF requirement: *Unique Patient ID, duplicate detection,
multiple cases, relevant clinical information and complete history.*

## What was already in place

- Server-generated unique Patient ID (`AA-P-<uuid>`), unique per clinic.
- Clinic-scoped duplicate detection on create and edit, with explicit user confirmation.
- One patient linked to many cases; archived patients cannot be linked to new cases.
- Clinical notes, medical history and dental history on the patient record.
- Append-only `PatientHistory` audit for create and edit, with actor attribution and
  optimistic revision checks.

## Added in this increment

### Archive / restore (soft delete)

`POST /api/clinic/patients/{id}/archive` with `{ action: "ARCHIVE" | "RESTORE", revision }`.

- Requires a verified doctor session or an active clinic user with patient access.
  Clinic viewers are read-only.
- Archiving never deletes rows. The patient, clinical information, linked cases and
  full history stay in the database.
- Archiving is blocked while the patient has any linked case that is not `COMPLETED`,
  so a patient in active treatment cannot be hidden.
- Archive and restore both increment `revision` and append `ARCHIVED` / `RESTORED`
  to `PatientHistory` with before/after snapshots.
- Requests carry the revision the user saw. A stale revision returns 409 and the UI
  asks the user to reload.
- Archive and restore are idempotent: repeating the current state is a no-op.

### Archived records in the list

- `GET /api/clinic/patients` keeps excluding archived patients by default.
- `GET /api/clinic/patients?archived=1` lists only archived patients, with the same
  clinic-scoped search and pagination.
- `GET /api/clinic/patients/{id}` now returns archived patients so their complete
  history remains readable. Editing an archived patient still returns 404 until it
  is restored.

### Retired unaudited registration path

- `/clinic/patient-master/new` now redirects to `/clinic/patients`.
- `/api/clinic/patients/register` returns `410 Gone`. The old endpoint inserted rows
  with raw SQL, bypassing duplicate detection and the audit trail. All registration
  now goes through `POST /api/clinic/patients`.

## Verification

```powershell
node --experimental-strip-types --test scripts/patient-unit.test.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js
```

The unit suite now covers archive request validation (known action, integer revision,
no caller-supplied ownership fields).

## Deliberate limits

- No hard delete is exposed.
- Duplicate detection remains advisory: two different patient codes can still describe
  the same person if staff confirm the warning.
- Archive does not cascade to cases, files or history; it only hides the patient from
  the active list and blocks new case linkage.
