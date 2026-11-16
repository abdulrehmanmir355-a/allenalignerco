// Backup-first application of the additive daily-work schema repair.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = process.env.ALLEN_PROJECT_ROOT || path.resolve(__dirname, '..');
const req = require('node:module').createRequire(path.join(root, 'package.json'));
req('dotenv').config({ path: path.join(root, '.env'), quiet: true });
req('dotenv').config({ path: path.join(root, '.env.local'), override: true, quiet: true });
const { Client } = req('pg');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');
const url = new URL(connectionString);
const databaseName = decodeURIComponent(url.pathname.slice(1));
if (databaseName !== 'allen_aligner') {
  throw new Error('Expected the Allen Aligner application database; no changes made.');
}
if (!process.argv.includes('--apply')) {
  console.log('Use --apply to create a verified backup and apply the additive work-tracking repair. No changes made.');
  process.exit(0);
}

const backupDir = path.join(root, '.private', 'database-backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDir, `${databaseName}-work-tracking-${stamp}.dump`);
const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin' : '');
const executable = name => bin ? path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || '5432',
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: databaseName
};
const backup = spawnSync(executable('pg_dump'), [
  '--format=custom', '--no-owner', '--no-privileges', '--file', backupFile
], { env, encoding: 'utf8', windowsHide: true });
if (backup.status !== 0) {
  fs.rmSync(backupFile, { force: true });
  const details = String(backup.error?.message || backup.stderr || '').trim().split(/\r?\n/)[0];
  throw new Error(`Database backup failed; migration was not applied.${details ? ` ${details}` : ''}`);
}
const verified = spawnSync(executable('pg_restore'), ['--list', backupFile], {
  encoding: 'utf8', windowsHide: true
});
if (verified.status !== 0 || !verified.stdout.includes('WorkReport')) {
  throw new Error('Backup verification failed; migration was not applied.');
}

(async () => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const migrations = [
      '20261027180000_work_reporting_repair.sql',
      '20261027190000_work_reporting_active_account_scope.sql'
    ];
    for (const name of migrations) {
      await client.query(fs.readFileSync(
        path.join(root, 'database', 'migrations', name),
        'utf8'
      ));
    }
    const checks = await client.query(`
      SELECT to_regprocedure('public.aa_missing_work(timestamp with time zone)') IS NOT NULL AS missing_work,
             to_regprocedure('public.aa_send_work_reminders(timestamp with time zone)') IS NOT NULL AS work_reminders,
             to_regclass('public."HRAssetIssue"') IS NOT NULL AS asset_issue,
             to_regclass('public."HRAssetActivity"') IS NOT NULL AS asset_activity
    `);
    if (!checks.rows[0].missing_work || !checks.rows[0].work_reminders || !checks.rows[0].asset_issue || !checks.rows[0].asset_activity) {
      throw new Error('Post-migration schema verification failed.');
    }
    console.log(JSON.stringify({
      database: databaseName,
      migrations,
      applied: true,
      backup: backupFile,
      backupBytes: fs.statSync(backupFile).size,
      backupValidated: true,
      schema: checks.rows[0]
    }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed; transaction rolled back:', error.code || '', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})().catch(error => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
