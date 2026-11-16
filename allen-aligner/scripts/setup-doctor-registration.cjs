const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
require('dotenv').config({ path: path.join(root, '.env.local'), override: true, quiet: true });

async function main() {
  const connectionString = process.env.LOCAL_DATABASE_URL;
  if (!connectionString) throw new Error('LOCAL_DATABASE_URL is required. No migration was applied.');
  const url = new URL(connectionString);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/allen_aligner') throw new Error('Expected the local allen_aligner database. No migration was applied.');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const check = async () => (await client.query(`SELECT to_regclass('public."Doctor"') IS NOT NULL AS doctor,to_regclass('public."DoctorVerificationAudit"') IS NOT NULL AS audit,(SELECT count(*)=1 FROM pg_attribute WHERE attrelid=to_regclass('public."Doctor"') AND attname='registrationAuthority' AND NOT attisdropped) AS authority,(SELECT count(*)=1 FROM pg_attribute WHERE attrelid=to_regclass('public."DoctorVerificationAudit"') AND attname='actorHRId' AND NOT attisdropped) AS "hrReviewer"`)).rows[0];
    const before = await check();
    if (!before.doctor) throw new Error('Doctor table is missing. No migration was applied.');
    if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ schema: before, ready: before.audit && before.authority && before.hrReviewer })); return; }
    if (before.audit && before.authority && before.hrReviewer) { console.log(JSON.stringify({ applied: false, schemaVerified: true })); return; }
    const migrations = ['20261112140000_doctor_registration_verification.sql','20261112150000_doctor_verification_hr_reviewer.sql'].map(name => path.join(root, 'database', 'migrations', name));
    const backupDir = process.env.AA_DOCTOR_REGISTRATION_BACKUP_DIR || path.join(root, '.private', 'database-backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, `doctor-registration-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
    const bin = process.env.PG_BIN || 'C:\\Program Files\\PostgreSQL\\17\\bin';
    const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: 'allen_aligner' };
    const run = name => { const result = spawnSync(path.join(bin, `${name}.exe`), name === 'pg_dump' ? ['--format=custom', '--no-owner', '--no-privileges', '--file', backup] : ['--list', backup], { env, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 }); if (result.status !== 0) throw new Error(`${name} failed: ${result.error?.message || result.stderr || 'unknown error'}`); return result.stdout; };
    run('pg_dump');
    if (!run('pg_restore').includes('Doctor')) throw new Error('The database backup did not contain Doctor. No migration was applied.');
    for (const migration of migrations) await client.query(fs.readFileSync(migration, 'utf8'));
    const after = await check();
    if (!after.audit || !after.authority || !after.hrReviewer) throw new Error('Doctor registration migration verification failed.');
    console.log(JSON.stringify({ applied: true, backupValidated: true, schemaVerified: true, backup }));
  } finally { await client.end(); }
}
main().catch(error => { console.error('Doctor registration setup failed:', error.message || 'Unknown error.'); process.exitCode = 1; });
