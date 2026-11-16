# Direct PostgreSQL connection — 20 October 2026

The website now uses `pg` directly through `app/lib/database.ts`. Prisma runtime, generator, adapter and Studio are removed from the application dependencies. The existing PostgreSQL 17 database is `allen_aligner` on `127.0.0.1:5432`; credentials stay in `.env`. DBeaver is a management client for this same database, not an intermediary connection required by the website.

## Everyday operation

- Start PostgreSQL Windows service `postgresql-x64-17`, then run `npm run dev` in the project.
- Run `npm run db:check` to verify the connection and required tables.
- The connection pool is capped at four connections. PostgreSQL session timestamps use UTC.
- Use the existing DBeaver connection to `allen_aligner` for database administration. No Prisma service is required.
- No existing table was reset, dropped or truncated. `_prisma_migrations` remains as historical migration metadata; it is not an active Prisma connection.
- Original source and a consistent database-row snapshot were saved in the Codex work folder before changes. That backup is private and is not part of the website/public assets.

## Files and privacy

Doctors upload records from an owned case; completed files appear in the case and Documents. Small records are stored in PostgreSQL. Large records use `.private-clinical-uploads/<UUID>/object`; PostgreSQL holds ownership, versions, hashes and resumable session metadata. This folder must remain with the application and must be backed up together with the database. DBeaver will show metadata, not the large file bytes.

Private uploads are enabled locally. Maximum file size is 1 GB; chunks are 8 MB. Owner authentication, clinic/doctor scope, expiring assigned-lab access, checksums and content validation remain enforced. Completed files are not removed by this change. No automatic cleanup job is installed.

Large uploads still require a private object-storage adapter before a production deployment; the existing production guard remains enabled. This local repair does not configure cloud storage or publish the site.

## Tests

Integration tests are restricted to the separate local database `allen_aligner_codex_test` on port 5432. They do not run against `allen_aligner`. Use a separate local server with that test connection, `ALLEN_TEST_BUILD=true`, and `PORTAL_TEST_ORIGIN`/`APP_ORIGIN` set to its URL. Test fixtures are synthetic and scoped to random IDs. `ALLEN_TEST_BUILD` only changes the Next build directory.

The historical migration SQL is retained for schema provenance. Do not rerun those initial migrations against the existing database. Future schema changes require reviewed SQL and a backup.

## Header

The corrupted text arrow is replaced with an inline SVG. Desktop hover opens after 300 ms and allows 300 ms to move into a submenu. Click/touch toggles work, ArrowDown opens and focuses the submenu, Escape closes it, and focused controls have a visible outline.
