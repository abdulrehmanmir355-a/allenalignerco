const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const requireFromProject = Module.createRequire(path.join(root, 'package.json'));
requireFromProject('dotenv').config({ path: path.join(root, '.env'), quiet: true });
requireFromProject('dotenv').config({ path: path.join(root, '.env.local'), override: true, quiet: true });
const { Client } = requireFromProject('pg');
const backupDir = path.join(root, '.private', 'database-backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

async function apply({ label, url, migration, expectedTables }) {
  if (!url) throw new Error(`${label} database connection is not configured.`);
  const parsed = new URL(url);
  const backup = path.join(backupDir, `password-recovery-${label}-${stamp}-${randomBytes(3).toString('hex')}.json`);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const before = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])`, [expectedTables]);
    fs.writeFileSync(backup, JSON.stringify({ database: label, host: parsed.host, capturedAt: new Date().toISOString(), recoveryTablesBefore: before.rows.map(row => row.table_name) }, null, 2), { flag: 'wx' });
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(root, 'database', 'migrations', migration), 'utf8'));
    const check = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])`, [expectedTables]);
    const found = new Set(check.rows.map(row => row.table_name));
    const missing = expectedTables.filter(name => !found.has(name));
    if (missing.length) throw new Error(`Migration verification failed; missing tables: ${missing.join(', ')}.`);
    await client.query('COMMIT');
    console.log(JSON.stringify({ database: label, host: parsed.host, migration, applied: true, tablesVerified: expectedTables.length, preMigrationSchemaSnapshot: path.relative(root, backup) }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

(async () => {
  const ownerNeon = process.env.OWNER_NEON_DATABASE_URL;
  const ownerLocal = process.env.OWNER_DATABASE_URL;
  const clinical = process.env.DATABASE_URL;
  if (!ownerNeon || !ownerLocal || !clinical) throw new Error('Expected Neon Owner, local Owner, and clinical application database URLs.');
  await apply({ label: 'owner-neon', url: ownerNeon, migration: '20261106120000_owner_password_reset.sql', expectedTables: ['OwnerPasswordReset'] });
  await apply({ label: 'owner-local', url: ownerLocal, migration: '20261106120000_owner_password_reset.sql', expectedTables: ['OwnerPasswordReset'] });
  await apply({ label: 'clinical-local', url: clinical, migration: '20261106120100_doctor_password_recovery.sql', expectedTables: ['DoctorPasswordResetRequest', 'DoctorPasswordReset'] });
  await apply({ label: 'clinical-local', url: clinical, migration: '20261106120200_doctor_password_recovery_complaints.sql', expectedTables: ['DoctorPasswordRecoveryComplaint'] });
})().catch(error => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
