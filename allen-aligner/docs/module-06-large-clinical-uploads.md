# Module 06 — local implementation

This is functional local development storage, NOT a production-ready clinical storage service. Metadata now uses direct PostgreSQL. See DATABASE-CONNECTION.md for current setup.

## Use
- Keep ENABLE_PRIVATE_UPLOADS=true in local development. The existing <=10 MB upload remains unchanged.
- Open an owned draft/change-requested case. Select one or more large files and press Upload for each. Pause aborts the current request; Resume queries committed chunks and verifies their hashes. After a reload, select the original file again. Sessions expire after 24 hours.
- Files are streamed to an opaque private object in .private-clinical-uploads/<UUID>/object; never under public/. Windows folder ACLs must restrict the repository/storage directory to the application user (POSIX mode flags alone do not establish Windows ACLs).
- Limits: 1 GB/file, 8 MB/chunk, 10 active sessions/case, 100 completed versions/case. Same sanitized filename receives successive versions. DICOM requires a Part 10 DICM header; PLY header must fit within 64 KiB. Signature screening is not full parser validation or malware scanning.
- Doctor downloads recheck verified login and doctor + clinic case ownership. Assigned labs use the existing expiring case-scoped Bearer token and may only download submitted cases. All downloads are attachments with private/no-store and nosniff headers.

## HTTP contract
Base: /api/portal/cases/:caseId/large-uploads
- GET base: completed metadata and active resumable sessions (no private storage keys).
- POST base: JSON {name,size,sha256?}; returns id, chunkSize, totalChunks, expiresAt. SHA256 is lowercase hex; browser calculates every chunk checksum, while an API caller may also supply the expected full-file hash.
- GET /:uploadId: status and committed chunk indexes/hashes.
- PUT /:uploadId/chunks/:index: exact raw chunk bytes and X-Chunk-SHA256. Matching retries are idempotent; conflicting retries fail.
- POST /:uploadId/finalize: validates completeness, disk chunk hashes, full size/hash and file signature; writes private object and version metadata. Retrying a completed finalize returns the same file.
- DELETE /:uploadId: cancel incomplete session and delete its local bytes. Completed files cannot be cancelled.
- GET /files/:fileId: owner-only streaming download.
- Lab: GET /api/lab/cases/:caseId now includes largeFiles; download at /api/lab/cases/:caseId/large-files/:fileId with existing Bearer authorization.

All doctor mutations use existing same-origin checks. Mutations lock the case row so chunk/cancel/finalize and version assignment serialize. Case submission recognizes both legacy and large records. Finalization uses bounded memory (one chunk plus small signature buffers); it holds a local DB transaction while assembling, with a 120-second timeout. If the process dies after object promotion but before metadata commit, retained chunks allow a finalize retry. Never delete chunks before that commit. Automatic cleanup is not enabled; the old cleanup command was retired during the database migration. Unreferenced directories after a case is deleted need an audited retention/reconciliation job.

## Production work still required
NODE_ENV=production deliberately rejects local large-file storage. Implement a private S3-compatible/Azure/GCS adapter behind the storage boundary; keep bucket/container public access disabled, least-privilege service credentials, TLS, encryption with managed keys and approved regional residency. Use immutable object keys, multipart checksums, quarantine/scanning before download eligibility, lifecycle cleanup for abandoned parts, short-lived case-authorized signed downloads (or authenticated proxy streaming), and durable database/object reconciliation. Add organization quotas/rate limits, audit access logs, retention/deletion policies, backups and restore tests. Avoid long database transactions during production object assembly: use durable finalize state, leases and idempotent completion. Configure proxy body/time limits and test interrupted uploads at the actual deployment limits. Validate medical/legal obligations with the responsible organization. No production credentials or public storage were configured here.

## Verification
Run npm run db:check and npm run typecheck. Integration tests require the separate allen_aligner_codex_test database. Run the local server with ENABLE_PRIVATE_UPLOADS=true, then PORTAL_TEST_ORIGIN matching it and npm run test:large-uploads. This uses real login with unique synthetic doctors/cases and removes its own fixtures in finally. npm run test:portal exercises legacy behavior. Migration only adds the three upload tables, enum, indexes and foreign keys; never reset the database.
