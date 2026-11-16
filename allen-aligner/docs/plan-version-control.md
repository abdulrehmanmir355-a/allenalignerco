# Module 12 — Plan Version Control

The existing TreatmentPlan, ClinicalReview, ClinicalReviewAudit, TreatmentPlanFile and TreatmentPlanVersionAudit records remain the source of truth. No replacement tables or review system were introduced.

## Version creation

The laboratory plan route requires both the existing case access grant and an active employee session. It locks the case, checks its revision, allocates the next integer version, inserts a pending plan and records activity atomically. The existing unique case/version index and sequential-version trigger reject duplicates and gaps.

V1 has no parent. Ordinary revisions link to the preceding version and require a written revision reason. Restoration links to the explicitly selected source, records its actual version in activity, and creates a fresh pending version. Ordinary revisions snapshot current case files, including new uploads; restoration copies only the selected source's file bindings. Parent links do not carry approval.

Existing content, identities, author/time, decisions, file bytes and audit records remain protected by the existing database guards. The new additive migration also prevents approval metadata on insertion, missing reasons/parent references, and truncation of plan history. Historical rows are not rewritten or backfilled.

## Reviews and release

The existing enqueue trigger creates a separate pending ClinicalReview per plan. The verified preparer cannot be assigned to review their own version. The clinical service requires assignment, checklist findings and explicit independent approval before release to the doctor. Doctor decisions identify the exact latest released plan and record identity, time, confirmation and a hashed artifact manifest in the existing immutable audit.

A newer pending version does not replace historical approved content. It blocks manufacturing until its own independent and doctor approvals are complete. The existing manufacturing service verifies the current exact artifact; database release guards independently enforce version-specific approval.

Clinical history displays author, creation time, reason, internal and doctor status and read-only prior versions. Laboratory and doctor history retain lineage labels. Global CSS and unrelated modules are unchanged.

## Migration and verification

The prerequisite Module 12, doctor-approval and independent-review migrations must already be installed. The verifier now applies only 20261029120000_plan_revision_integrity.sql, twice on a restored disposable clone. Reapplying the older base Module 12 migration would overwrite later doctor audit functions and action constraints, so the verifier no longer does that.

Run npm run test:plan-versions:db for backup-first isolated acceptance tests. Run npm run db:plan-versions to repeat verification and then apply the verified additive migration to the local allen_aligner database. A full custom-format backup is created and restored before tests; the temporary database is removed afterward. No fixtures are inserted into the working database.

The acceptance suite uses the real laboratory, clinical and portal route handlers with cookie access adapted for the Node test harness. It covers V1–V3, reasons and lineage, immutable history and files, duplicate/gap rejection, concurrent API creation, restoration, independent review and self-assignment rejection, exact doctor decisions, audit evidence, manufacturing acceptance/rejection and preservation of prior approved versions. Browser interaction and external planning-platform simulation are outside this suite.
