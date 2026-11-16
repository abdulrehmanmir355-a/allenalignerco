// Local database-administrator helper. It calls the audited SQL functions and
// refuses any non-local database. It cannot grant REVIEWER or LEAD access.
require('dotenv').config({ quiet: true });
require('dotenv').config({ path: '.env.local', override: true, quiet: true });
const { Pool } = require('pg');
const [employeeId, action, reason] = process.argv.slice(2);
const mapped = action === 'ADMIN' ? 'APPOINT' : action === 'REVOKE' ? 'REMOVE' : action;
if (!/^AA-EMP-\d{6,}$/.test(employeeId || '') || !['APPOINT', 'REMOVE'].includes(mapped || '') || !reason || reason.trim().length < 10) {
  console.error('Usage: node scripts/clinical-admin.cjs AA-EMP-000001 APPOINT "Written authorization reason"');
  console.error('REMOVE revokes ADMIN only. REVIEWER and LEAD access use the registration workflow.');
  process.exit(1);
}
const raw = process.env.LOCAL_DATABASE_URL;
if (!raw) {
  console.error('LOCAL_DATABASE_URL is missing. This helper does not use the cloud database.');
  process.exit(1);
}
const target = new URL(raw);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || decodeURIComponent(target.pathname.slice(1)) !== 'allen_aligner') {
  console.error('Refusing to run: clinical administrator changes are limited to local allen_aligner.');
  process.exit(1);
}
(async () => {
  const pool = new Pool({ connectionString: raw });
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT public.aa_clinical_db_admin_change($1,$2,$3) AS result',
      [employeeId, mapped, reason.trim()]
    );
    const row = result.rows[0].result;
    console.log(`${mapped} recorded for ${row.employeeId}. Previous role: ${row.previousRole || 'none'}. New role: ${row.newRole || 'none'}.`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(error => {
  console.error(error.message || 'Clinical administrator change failed.');
  process.exitCode = 1;
});
