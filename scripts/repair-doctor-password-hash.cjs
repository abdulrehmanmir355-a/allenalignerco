// Local operator repair only. Never expose this tool as an HTTP route.
// Converts an explicitly selected existing plaintext credential to bcrypt.
// Does not change the password, verification, clinic, permissions or other accounts.
const root = require('node:path').resolve(__dirname, '..');
require(root + '/node_modules/dotenv').config({ path: root + '/.env', quiet: true });
const { Client } = require(root + '/node_modules/pg');
const { hash, compare } = require(root + '/node_modules/bcryptjs');
const { createHash, randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const email = (process.argv[2] || '').trim().toLowerCase();
const verify = process.argv[3] === '--verify-local';
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || process.argv.length > 4 || (process.argv[3] && !verify)) throw Error('Usage: node scripts/repair-doctor-password-hash.cjs EMAIL [--verify-local]');
const url = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('This repair tool requires a local database.');
const db = new Client({ connectionString: url.toString(), options: '-c timezone=UTC' });
const bcryptPattern = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
let sessionHash;
async function main() {
  await db.connect();
  try {
    if (verify) {
      const ready = await fetch('http://localhost:3000/doctor-login', { signal: AbortSignal.timeout(15000) });
      if (!ready.ok) throw Error('The local application must be available before verification.');
    }
    await db.query('BEGIN');
    let doctor, plaintext, repaired;
    try {
      const selected = await db.query('SELECT id,email,"passwordHash","isVerified","clinicId" FROM "Doctor" WHERE lower(trim(email))=$1 FOR UPDATE', [email]);
      if (selected.rows.length !== 1) throw Error('Expected exactly one matching doctor account.');
      doctor = selected.rows[0];
      if (bcryptPattern.test(doctor.passwordHash)) {
        await db.query('ROLLBACK');
        console.log(JSON.stringify({ email, changed: false, reason: 'Already stored as bcrypt. No account changes made.' }));
        return;
      }
      // Unknown encoded/corrupt hash formats need an explicit password reset instead.
      plaintext = doctor.passwordHash;
      if (typeof plaintext !== 'string' || !plaintext || Buffer.byteLength(plaintext) > 72 || plaintext.startsWith('$') || /^[a-f0-9]{32,}$/i.test(plaintext)) throw Error('Stored credential is not recognized as plaintext. Use the account reset process.');
      repaired = await hash(plaintext, 12);
      assert(await compare(plaintext, repaired), 'Credential preservation check failed.');
      assert.equal(await compare(randomBytes(32).toString('hex'), repaired), false, 'Unrelated passwords must remain invalid.');
      const result = await db.query('UPDATE "Doctor" SET "passwordHash"=$2,"updatedAt"=clock_timestamp() WHERE id=$1 AND "passwordHash"=$3 RETURNING "isVerified","clinicId",email', [doctor.id, repaired, plaintext]);
      assert.equal(result.rowCount, 1);
      assert.equal(result.rows[0].isVerified, doctor.isVerified);
      assert.equal(result.rows[0].clinicId, doctor.clinicId);
      assert.equal(result.rows[0].email, doctor.email);
      await db.query('INSERT INTO "ManagementAudit"("actorId",scope,action,"recordId") VALUES($1,$2,$3,$4)', ['LOCAL_OPERATOR', doctor.clinicId || 'doctor_credentials', 'doctor.password_hash_repaired', doctor.id]);
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK'); throw e; }
    const result = { email, changed: true, format: 'bcrypt', passwordPreserved: true, verificationChanged: false, clinicChanged: false, auditRecorded: true };
    console.log(JSON.stringify(result));
    if (verify) {
      const base = 'http://localhost:3000';
      const login = await fetch(base + '/api/doctor-login', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: plaintext }), redirect: 'manual', signal: AbortSignal.timeout(60000) });
      const body = await login.json();
      assert.equal(login.status, 200, 'Local sign-in returned HTTP ' + login.status);
      assert.equal(body.success, true, 'Local sign-in was not accepted.');
      const cookie = login.headers.get('set-cookie')?.match(/allen_doctor_session=([a-f0-9]{64})/);
      assert(cookie, 'Expected a doctor session cookie.');
      sessionHash = createHash('sha256').update(cookie[1]).digest('hex');
      const session = await db.query('SELECT "doctorId" FROM "DoctorSession" WHERE "tokenHash"=$1', [sessionHash]);
      assert.equal(session.rows[0]?.doctorId, doctor.id, 'Local server must use the expected account/database.');
      const pages = [];
      for (const route of ['/doctor-dashboard', '/doctor-dashboard/cases', '/doctor-dashboard/patients']) {
        const response = await fetch(base + route, { headers: { Cookie: cookie[0] }, redirect: 'manual', signal: AbortSignal.timeout(120000) });
        const html = await response.text();
        assert.equal(response.status, 200, route + ' did not load.');
        assert(!html.includes('NEXT_HTTP_ERROR_FALLBACK;500'), route + ' had a server rendering error.');
        assert(html.includes('Private workspace'), route + ' did not show the authenticated workspace.');
        pages.push({ route, status: response.status });
      }
      const after = (await db.query('SELECT "passwordHash","isVerified","clinicId",email FROM "Doctor" WHERE id=$1', [doctor.id])).rows[0];
      assert(bcryptPattern.test(after.passwordHash));
      assert(await compare(plaintext, after.passwordHash));
      assert.equal(after.isVerified, doctor.isVerified);
      assert.equal(after.clinicId, doctor.clinicId);
      assert.equal(after.email, doctor.email);
      plaintext = undefined;
      console.log(JSON.stringify({ localSignIn: 200, authenticatedPages: pages, permissionsPreserved: true, workflowMigrationApplied: false }));
    }
  } finally {
    // Remove only the short-lived verification session issued by this tool.
    // Preserve all of the user's other sessions and the normal login throttle.
    if (sessionHash) await db.query('DELETE FROM "DoctorSession" WHERE "tokenHash"=$1', [sessionHash]);
    await db.end();
  }
}
main().catch(() => { console.error('Repair or local verification did not finish. Credentials and session tokens were not logged. Inspect the account state before retrying.'); process.exitCode = 1; });
