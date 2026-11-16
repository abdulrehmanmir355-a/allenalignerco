> Historical implementation notes. For the current direct PostgreSQL setup, see [DATABASE-CONNECTION.md](DATABASE-CONNECTION.md). Do not run the old Prisma commands below.

# Allen Aligner — Module 01 Doctor Portal

Scope: PDF page 7, Module 01 only and its authentication/storage prerequisites. The original Allen visual design and public/clinic pages are retained. Clinic management pages remain explicitly fictional demos and do not grant access to portal records.

## Implemented and persisted

- Verified doctor sign-in with bcrypt password checks, hashed random server-side session tokens, HttpOnly/SameSite cookies, secure cookies in production, eight-hour expiry, logout/revocation, persistent login throttling, and same-origin mutation checks.
- Every portal page/API checks the current verified account. Case queries require BOTH doctor ownership and the doctor's current clinic. Sharing a clinic name or clinic ID does not grant access to other doctors' cases. Team delegation is outside this module.
- Private case creation with a patient reference, type, notes and recorded sharing authorization; real counts, search/status filters, case lists and detail pages. Lists display the latest 200 matching records.
- Private draft file intake for PDF/JPEG/PNG/STL with a bounded request body, extension/signature checks, 10 MB per file and 20 files per case. Records are bytea values in the database, never public filesystem objects. Doctor and assigned-lab downloads are authenticated, attachment-only, non-cacheable and nosniff. Signature checks are not malware scanning or full clinical-format validation.
- Atomic status updates, timeline events, immutable plan summaries with sequential versions, current-version approval and adjustment requests, case comments, and in-app notifications with per-user read state. Optimistic revisions reject conflicting writes.
- Lab integration API scoped to one case with a hashed, expiring token issued by a local operator. Assigned lab can read submitted case records, download files, publish written plan versions, reply and move permitted lifecycle stages. No unscoped lab bearer token exists.

Lifecycle: DRAFT → SUBMITTED → PLANNING → REVIEW → APPROVED → IN_PRODUCTION → SHIPPED → COMPLETED. Lab may publish a plan directly from SUBMITTED. REVIEW → CHANGES_REQUESTED → REVIEW supports plan revisions. Only the doctor can approve; the lab cannot skip approval. Files can be added in DRAFT or CHANGES_REQUESTED.

## Not implemented / external dependencies

- No 3D treatment planning, tooth movement, medical algorithms or simulated clinical output. The UI explicitly states that the 3D viewer is not connected. Written plan review is real; visual 3D review is unavailable.
- A future viewer adapter must exchange an authorized case/plan ID for a short-lived, audience-restricted read grant, provide private assets, restrict iframe origins/CSP, and reject revoked ownership. Do not persist public patient-file URLs. No vendor API or licensed viewer has been selected.
- Lab operations currently use a documented API and local operator CLI, not a separate lab dashboard or automatic external vendor integration. Notification updates appear on refresh; no email/SMS, websocket or push provider is configured.
- Professional verification is a deliberate local operator action after checking credentials. No automated registry verification, email verification, password recovery or MFA exists yet.
- Clinic team management remains a demo. No cross-doctor sharing or delegated access is enabled.
- Local development storage is functional, not a production healthcare deployment. Production still needs an appropriate hosted database/private object store, encryption and backup controls, malware quarantine/scanning, access/download audit, retention/deletion processes, monitoring, deployment-specific rate limiting, HTTPS and configured APP_ORIGIN. Keep ENABLE_PRIVATE_UPLOADS=false in a public deployment until those controls are established.

## Local database and preservation note

The existing local Prisma/PGlite server on port 51214 ignores database names in connection URLs and internally uses template1. An initial additive migration therefore added the Module 01 tables and optional Doctor.clinicId column to that original instance before this behavior was detected. No original Doctor record was deleted or migrated. No reset/drop/truncate was run. Those additive tables were intentionally left in place to avoid destructive rollback.

A genuinely isolated, empty Prisma instance named allen-doctor-portal was then created, verified, and all three migrations were applied there. Its reported database port is 51218 and shadow port is 51219. PGlite calls its internal database template1 even though the instance and data directory are separate. The application's .env now points to port 51218. The schema migration is additive and compatible with a conventional dedicated PostgreSQL database too.

Original files, including the original local environment configuration, were backed up under the Codex task's work/original-files directory. Do not publish that directory or its environment file. No Git repository was present, so no commit or PR was made.

## Start locally

From C:\Users\NZ\Desktop\AllenAligner\allen-aligner:

```powershell
node node_modules/prisma/build/index.js dev start allen-doctor-portal
node node_modules/prisma/build/index.js generate --config prisma7.config.ts
node node_modules/prisma/build/index.js migrate deploy --config prisma7.config.ts
npm run dev
```

The existing development server is at http://localhost:3000. If it is already running, reuse it. The direct equivalent of npm run dev is `node node_modules/next/dist/bin/next dev`.

Visit /doctor-register to register a fresh account in the isolated database. Accounts from the old instance have not been copied. After verifying the professional's credentials outside the application, an authorized local operator runs:

```powershell
node scripts/portal-admin.cjs verify doctor@example.com
```

Replace the example email with the registered account. Never verify an unknown account merely to bypass the gate. Sign in at /doctor-login. The first verified login provisions a private clinic. To revoke access and invalidate sessions:

```powershell
node scripts/portal-admin.cjs revoke doctor@example.com
```

ENABLE_PRIVATE_UPLOADS=true is set for this isolated local development instance. Production cookies are Secure and require HTTPS. Set APP_ORIGIN to the exact deployed browser origin behind a reverse proxy. Do not use a development server for public patient intake.

## Lab integration boundary

Assign an operator-verified lab to a submitted case:

```powershell
node scripts/portal-admin.cjs assign-lab CASE_ID "Authorized lab name"
```

The command prints the secret once to the local operator. Store it securely. It expires in seven days; reissuing replaces it. Revoke with `node scripts/portal-admin.cjs revoke-lab CASE_ID`. Do not put tokens in query strings or frontend code.

Every lab request uses `Authorization: Bearer TOKEN`:

- GET /api/lab/cases/CASE_ID: submitted case, revision, written plans, messages, file metadata and timeline.
- GET /api/lab/cases/CASE_ID/files/FILE_ID: authorized attachment download.
- POST /api/lab/cases/CASE_ID: JSON `{"action":"comment","text":"Case-specific message","revision":CURRENT_REVISION}`.
- Publish: `{"action":"plan","summary":"Written plan supplied by the qualified lab","revision":CURRENT_REVISION}`.
- Transition: `{"action":"status","status":"PLANNING","revision":CURRENT_REVISION}`. Later permitted values follow the lifecycle above.

Fetch a fresh revision before each mutation. HTTP 409 means refresh/reconcile, not blindly retry. Plan publication and messages atomically add the doctor's in-app notification. A doctor message is available to the assigned lab when it fetches the case; there is no separate email delivery claim.

## Verification commands

```powershell
npm run typecheck
npm run lint
npm test
npm run build
$env:PORTAL_TEST_ORIGIN='http://localhost:3000'
npm run test:portal
```

The integration test requires the isolated local instance on port 51218, creates uniquely identified synthetic accounts/cases, and removes only its own fixtures in finally. It tests authorization, uploads/downloads, plan revision/review, lifecycle, notifications, public/private routes, logout and expiry. Never point it at production. Optional browser checks require Playwright and PORTAL_BROWSER_QA=true; PLAYWRIGHT_MODULE can specify the installed module path; PORTAL_BROWSER_CHANNEL=msedge uses installed Microsoft Edge on Windows. Next.js streamed notFound pages can return HTTP 200, so the test checks that another doctor's case page contains no patient reference and renders not-found content; APIs return 404.

## Reference research

The supplied PDF page 7 establishes the module scope. Reference products informed workflow only; no proprietary UI/code was copied.

- K Line Europe portal access: https://www.klinealigner.com/legal-notice
- Magic Touch LabConnex case-scoped communication and history: https://www.magictouchsoftware.com/products/labconnex-portal
