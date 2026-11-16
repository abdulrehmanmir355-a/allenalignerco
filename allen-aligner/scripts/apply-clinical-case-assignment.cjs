const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
dotenv.config({ path: path.join(root, '.env.local'), override: true, quiet: true });

const connectionString = process.env.LOCAL_DATABASE_URL;
if (!connectionString) throw new Error('LOCAL_DATABASE_URL is required. No migration was applied.');
const url = new URL(connectionString);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/allen_aligner') {
  throw new Error('Expected the local allen_aligner database. No migration was applied.');
}

const migrationPath = path.join(root, 'database', 'migrations', '20261107120000_clinical_case_assignment.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const pgBin = process.env.PG_BIN || 'C:\\Program Files\\PostgreSQL\\17\\bin';
const backupDirectory = path.join(root, '.private', 'database-backups');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDirectory, `clinical-case-assignment-${timestamp}.dump`);
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || '5432',
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: 'allen_aligner',
};

function runPg(program, args) {
  const result = spawnSync(path.join(pgBin, `${program}.exe`), args, {
    env,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`${program} failed: ${result.stderr || result.error?.message || 'unknown error'}`);
  return result.stdout;
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const existing = await client.query(`SELECT
      to_regclass('"ClinicalCaseAssignment"') IS NOT NULL AS table_exists,
      to_regclass('"ClinicalCaseAssignmentAudit"') IS NOT NULL AS audit_exists`);
    if (existing.rows[0].table_exists || existing.rows[0].audit_exists) {
      if (!existing.rows[0].table_exists || !existing.rows[0].audit_exists) {
        throw new Error('A partial case-assignment schema already exists. Database unchanged.');
      }
      const verified = await client.query(`SELECT count(*)::int AS triggers
        FROM pg_trigger WHERE NOT tgisinternal
          AND tgname IN ('aa_clinical_case_assignment_guard','aa_clinical_case_assignment_audit',
            'aa_clinical_case_assignment_audit_immutable','aa_clinical_case_assignment_audit_no_truncate')`);
      if (verified.rows[0].triggers !== 4) throw new Error('Existing assignment schema failed trigger verification.');
      console.log(JSON.stringify({ database: 'allen_aligner', migration: path.basename(migrationPath), applied: false, schemaVerified: true }));
      return;
    }

    fs.mkdirSync(backupDirectory, { recursive: true });
    runPg('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', backupPath]);
    const archive = runPg('pg_restore', ['--list', backupPath]);
    if (!archive.includes('PortalCase') || !archive.includes('WorkAccount')) {
      throw new Error('Local database backup validation failed. Migration was not applied.');
    }
    await client.query(migration);

    const verified = await client.query(`SELECT
      to_regclass('"ClinicalCaseAssignment"') IS NOT NULL AS table_exists,
      to_regclass('"ClinicalCaseAssignmentAudit"') IS NOT NULL AS audit_exists,
      (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal
        AND tgname IN ('aa_clinical_case_assignment_guard','aa_clinical_case_assignment_audit',
          'aa_clinical_case_assignment_audit_immutable','aa_clinical_case_assignment_audit_no_truncate')) AS triggers`);
    if (!verified.rows[0].table_exists || !verified.rows[0].audit_exists || verified.rows[0].triggers !== 4) {
      throw new Error('Local migration completed but schema verification failed.');
    }
    console.log(JSON.stringify({
      database: 'allen_aligner',
      migration: path.basename(migrationPath),
      applied: true,
      backupPath: path.relative(root, backupPath),
      backupValidated: true,
      schemaVerified: true,
    }));
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
