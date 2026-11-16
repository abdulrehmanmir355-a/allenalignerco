// Rolls back every synthetic row. Refuses any database that is not local allen_aligner.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
require(root + '/node_modules/dotenv').config({ path: root + '/.env', quiet: true });
require(root + '/node_modules/dotenv').config({ path: root + '/.env.local', override: true, quiet: true });
const ts = require(root + '/node_modules/typescript');
const { Client } = require(root + '/node_modules/pg');
const { randomUUID } = require('node:crypto');
const decisionSource = 'class PortalError extends Error { constructor(status, message) { super(message); this.status = status; } }\n'
  + fs.readFileSync(path.join(root, 'app/lib/clinical-registration-decision.ts'), 'utf8')
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?\r?\n/g, '');
const compiled = ts.transpileModule(decisionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiledPath = path.join(os.tmpdir(), 'allen-clinical-decision-' + process.pid + '.cjs');
fs.writeFileSync(compiledPath, compiled);
const { decideClinicalRegistration } = require(compiledPath);
const policySource = 'class PortalError extends Error { constructor(status, message) { super(message); this.status = status; } }\n'
  + fs.readFileSync(path.join(root, 'app/lib/clinical-team-policy.ts'), 'utf8')
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?\r?\n/g, '');
const policyCompiled = ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const policyPath = path.join(os.tmpdir(), 'allen-clinical-policy-' + process.pid + '.cjs');
fs.writeFileSync(policyPath, policyCompiled);
const { assertOrdinaryTeamChange } = require(policyPath);
for (const role of ['ADMIN', 'REVIEWER', 'LEAD']) {
  assert.throws(() => assertOrdinaryTeamChange(role), error => error.status === 403);
}
assert.doesNotThrow(() => assertOrdinaryTeamChange(null));
const registrationRoute = fs.readFileSync(path.join(root, 'app/api/clinical/registration/route.ts'), 'utf8');
assert.match(registrationRoute, /role:z\.enum\(\['REVIEWER','LEAD'\]\)/);
assert.match(registrationRoute, /\.strict\(\)/);
assert.doesNotMatch(registrationRoute, /employeeId/);

const raw = process.env.LOCAL_DATABASE_URL;
if (!raw) throw new Error('LOCAL_DATABASE_URL is missing');
const target = new URL(raw);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || decodeURIComponent(target.pathname.slice(1)) !== 'allen_aligner') {
  throw new Error('Safety test refused: local allen_aligner is required');
}
process.env.NODE_ENV = 'development';

const results = [];
function pass(name) { results.push(name); }
pass('ordinary administrators cannot assign ADMIN, REVIEWER, or LEAD directly');
pass('registration request schema does not accept an Employee ID');
async function expectSqlFailure(client, sql, params, pattern) {
  await client.query('SAVEPOINT expected_failure');
  try {
    await client.query(sql, params);
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT expected_failure');
    if (!pattern.test(error.message)) throw error;
    return;
  }
  await client.query('ROLLBACK TO SAVEPOINT expected_failure');
  throw new Error('Expected database function to reject the request');
}

(async () => {
  const client = new Client({ connectionString: raw });
  const locker = new Client({ connectionString: raw });
  await client.connect();
  await locker.connect();
  try {
    const before = await client.query(`SELECT w."clinicalRequest"->>'status' AS status, w."clinicalRole" AS role FROM "ClinicalIdentity" e JOIN "WorkAccount" w ON w.id=e."accountId" WHERE e."permanentId"='AA-EMP-000003'`);
    assert.equal(before.rows[0]?.status, 'PENDING');
    assert.equal(before.rows[0]?.role, null);
    pass('existing AA-EMP-000003 request is still pending before tests');

    const acl = await client.query(`SELECT p.proname, COALESCE(p.proacl::text, 'DEFAULT_PUBLIC') AS acl FROM pg_proc p WHERE p.proname IN ('aa_clinical_db_registration_decide','aa_clinical_db_admin_change') ORDER BY 1`);
    assert.equal(acl.rows.length, 2);
    for (const row of acl.rows) assert.equal(/(^\{|,)=X\//.test(row.acl), false, row.proname + ' still grants PUBLIC execute');
    pass('database administrator functions are installed and PUBLIC execute is revoked');

    await client.query('BEGIN');
    const tx = { query: async (sql, params = []) => (await client.query(sql, params)).rows };
    const borrowed = await client.query(`
      SELECT w.id AS "accountId", e."permanentId" AS "employeeId"
      FROM "WorkAccount" w
      JOIN "ClinicalIdentity" e ON e."accountId"=w.id
      WHERE e."permanentId" <> 'AA-EMP-000003'
        AND e.status = 'ACTIVE'
        AND w.role IS DISTINCT FROM 'CLINICAL_ONLY'
        AND e."permanentId" LIKE 'AA-EMP-%'
      ORDER BY e."permanentId"
      LIMIT 3
      FOR UPDATE OF w`);
    assert.equal(borrowed.rows.length, 3, 'three existing non-applicant employee accounts are required for the rolled-back test');
    const [applicant, administrator, promoted] = borrowed.rows;
    const borrowedIds = borrowed.rows.map(row => row.accountId);
    const snapshot = await client.query(`SELECT id::text, "clinicalRole", "clinicalRequest", "isActive", "mustChangePassword" FROM "WorkAccount" WHERE id = ANY($1::uuid[]) ORDER BY id`, [borrowedIds]);
    await client.query(`UPDATE "WorkAccount" SET "passwordHash"=COALESCE("passwordHash",'safety-test-not-a-credential'),"isActive"=true,"mustChangePassword"=false,"clinicalRole"=NULL,"clinicalRequest"=NULL WHERE id = ANY($1::uuid[])`, [borrowedIds]);
    pass('existing employee accounts borrowed inside a transaction');

    const requestId = randomUUID();
    const request = { id: requestId, role: 'REVIEWER', reason: 'Isolated qualification evidence for safety test.', status: 'PENDING', requestedAt: new Date().toISOString() };
    await client.query(`UPDATE "WorkAccount" SET "clinicalRequest"=$2::jsonb WHERE id=$1`, [applicant.accountId, JSON.stringify(request)]);
    const duplicate = await client.query(`SELECT "clinicalRequest"->>'status' AS status FROM "WorkAccount" WHERE id=$1 FOR UPDATE`, [applicant.accountId]);
    assert.equal(duplicate.rows[0].status, 'PENDING');
    pass('pending request is stored on the applicant account');

    try {
      await decideClinicalRegistration(tx, { accountId: applicant.accountId, requestId, decision: 'APPROVE', reason: 'Applicant cannot decide this request.' }, { id: applicant.accountId, name: 'Safety Applicant', role: 'ADMIN', source: 'CLINICAL_ADMIN' });
      throw new Error('self-approval unexpectedly succeeded');
    } catch (error) {
      if (!(error.status === 403 && /self-approval/i.test(error.message))) throw error;
    }
    pass('self-approval is rejected');

    await expectSqlFailure(client, `SELECT public.aa_clinical_db_admin_change($1,'APPOINT',$2)`, [applicant.employeeId, 'Cannot appoint an applicant with a pending registration.'], /pending/i);
    pass('pending applicant cannot be appointed Clinical ADMIN');

    await client.query(`UPDATE "WorkAccount" SET "clinicalRole"='ADMIN' WHERE id=$1`, [administrator.accountId]);
    await decideClinicalRegistration(tx, { accountId: applicant.accountId, requestId, decision: 'APPROVE', reason: 'Qualifications verified by clinical administrator.' }, { id: administrator.accountId, name: 'Safety Administrator', email: 'safety-admin@example.invalid', role: 'ADMIN', source: 'CLINICAL_ADMIN' });
    const approved = await client.query(`SELECT "clinicalRole" AS role, "clinicalRequest"->>'status' AS status FROM "WorkAccount" WHERE id=$1`, [applicant.accountId]);
    assert.equal(approved.rows[0].role, 'REVIEWER');
    assert.equal(approved.rows[0].status, 'APPROVED');
    pass('clinical administrator approval grants REVIEWER access');

    await assert.rejects(
      () => decideClinicalRegistration(tx, { accountId: applicant.accountId, requestId, decision: 'REJECT', reason: 'A second decision must not replace the first.' }, { id: administrator.accountId, name: 'Safety Administrator', role: 'ADMIN', source: 'CLINICAL_ADMIN' }),
      (error) => error.status === 409
    );
    pass('a second decision is rejected');

    const leadRequestId = randomUUID();
    await client.query(`UPDATE "WorkAccount" SET "clinicalRole"=NULL, "clinicalRequest"=$2::jsonb WHERE id=$1`, [promoted.accountId, JSON.stringify({ id: leadRequestId, role: 'LEAD', reason: 'Lead qualification evidence for the safety test.', status: 'PENDING', requestedAt: new Date().toISOString() })]);
    const ownerDecision = await client.query(`SELECT public.aa_clinical_db_registration_decide($1,$2,'REJECT',$3) AS result`, [promoted.accountId, leadRequestId, 'Qualifications do not yet support Lead access.']);
    assert.equal(ownerDecision.rows[0].result.status, 'REJECTED');
    const rejected = await client.query(`SELECT "clinicalRole" AS role, "clinicalRequest"->>'status' AS status, "clinicalRequest"->>'decisionReason' AS reason, "clinicalRequest"->>'decidedByRole' AS actor FROM "WorkAccount" WHERE id=$1`, [promoted.accountId]);
    assert.equal(rejected.rows[0].status, 'REJECTED');
    assert.equal(rejected.rows[0].role, null);
    assert.match(rejected.rows[0].reason, /Lead access/);
    assert.equal(rejected.rows[0].actor, 'DATABASE_ADMIN');
    await expectSqlFailure(client, `SELECT public.aa_clinical_db_registration_decide($1,$2,'APPROVE',$3)`, [promoted.accountId, leadRequestId, 'This later approval must lose.'], /already decided/i);
    pass('database administrator rejection is final and records the reason');

    await client.query(`UPDATE "WorkAccount" SET "clinicalRequest"=NULL WHERE id=$1`, [promoted.accountId]);
    const appointed = await client.query(`SELECT public.aa_clinical_db_admin_change($1,'APPOINT',$2) AS result`, [promoted.employeeId, 'Bootstrap the safety-test administrator inside a rolled-back transaction.']);
    assert.equal(appointed.rows[0].result.newRole, 'ADMIN');
    await expectSqlFailure(client, `SELECT public.aa_clinical_db_admin_change($1,'APPOINT',$2)`, [promoted.employeeId, 'A second appointment must not be required.'], /already/i);
    pass('first eligible employee can be appointed Clinical ADMIN');

    const audit = await client.query(`SELECT action, "actorName" FROM "ClinicalReviewAudit" WHERE detail->>'accountId'=$1 ORDER BY id`, [applicant.accountId]);
    assert.ok(audit.rows.some(row => row.action === 'CLINICAL_REGISTRATION_DECISION' && row.actorName === 'Safety Administrator'));
    pass('audit history names the deciding actor');

    await client.query('ROLLBACK');
    const after = await client.query(`SELECT w."clinicalRequest"->>'status' AS status, w."clinicalRequest"->>'role' AS role, w."clinicalRole" AS approved FROM "ClinicalIdentity" e JOIN "WorkAccount" w ON w.id=e."accountId" WHERE e."permanentId"='AA-EMP-000003'`);
    assert.equal(after.rows[0].status, 'PENDING');
    assert.equal(after.rows[0].role, 'REVIEWER');
    assert.equal(after.rows[0].approved, null);
    const restored = await client.query(`SELECT id::text, "clinicalRole", "clinicalRequest", "isActive", "mustChangePassword" FROM "WorkAccount" WHERE id = ANY($1::uuid[]) ORDER BY id`, [borrowedIds]);
    assert.deepEqual(restored.rows, snapshot.rows);
    pass('rollback restored borrowed employees and preserved AA-EMP-000003');

    const preserved = await client.query(`SELECT w.id FROM "ClinicalIdentity" e JOIN "WorkAccount" w ON w.id=e."accountId" WHERE e."permanentId"='AA-EMP-000003'`);
    await locker.query('BEGIN');
    await locker.query(`SELECT id FROM "WorkAccount" WHERE id=$1 FOR UPDATE`, [preserved.rows[0].id]);
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout='1500ms'`);
    await assert.rejects(
      () => client.query(`SELECT id FROM "WorkAccount" WHERE id=$1 FOR UPDATE`, [preserved.rows[0].id]),
      (error) => error.code === '55P03'
    );
    await client.query('ROLLBACK');
    await locker.query('ROLLBACK');
    pass('a concurrent decision waits on the locked registration row');

    const eligible = await client.query(`
      SELECT count(*)::int AS n
      FROM "WorkAccount" w
      JOIN "ClinicalIdentity" e ON e."accountId"=w.id
      WHERE w."isActive" AND e.status='ACTIVE' AND NOT w."mustChangePassword"
        AND w.role IS DISTINCT FROM 'CLINICAL_ONLY'
        AND COALESCE(w."clinicalRequest"->>'status','') <> 'PENDING'
        AND w."clinicalRole" IS DISTINCT FROM 'ADMIN'
        AND e."permanentId" LIKE 'AA-EMP-%'`);
    console.log('ELIGIBLE_ADMIN_CANDIDATES ' + eligible.rows[0].n);
    assert.ok(eligible.rows[0].n >= 1, 'an eligible real employee is required for first-administrator appointment');
    pass('a real employee other than the pending applicant can be appointed');
    console.log('PASS ' + results.length + ' clinical registration safety checks');
    for (const name of results) console.log(' - ' + name);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await locker.query('ROLLBACK').catch(() => {});
    await client.end();
    await locker.end();
    fs.rmSync(compiledPath, { force: true });
    fs.rmSync(policyPath, { force: true });
  }
})().catch(error => {
  fs.rmSync(compiledPath, { force: true });
  fs.rmSync(policyPath, { force: true });
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
