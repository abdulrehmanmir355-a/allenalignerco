// Transaction-only synthetic fixtures. Always rolled back; no existing row is edited.
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const req = require;
req('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const { Client } = req('pg');
async function main() {
 const url = new URL(process.env.DATABASE_URL);
 assert(['localhost','127.0.0.1'].includes(url.hostname) && url.port === '5432' && url.pathname === '/allen_aligner_codex_test');
 const db = new Client({options: "-c timezone=UTC",  connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
 await db.connect();
 let passed = 0;
 async function rejects(sql, params, code) {
  await db.query('SAVEPOINT expected_failure');
  let actual;
  try { await db.query(sql, params); } catch (e) { actual = e.code; }
  await db.query('ROLLBACK TO SAVEPOINT expected_failure');
  assert.equal(actual, code);
  passed++;
 }
 const clinic = randomUUID(), other = randomUUID(), patient = randomUUID(), doctor = randomUUID();
 const insertPatient = `INSERT INTO "Patient" (id,"clinicId","patientCode","fullName","normalizedName","updatedAt") VALUES ($1,$2,$3,'SYNTHETIC TEST','synthetic test',now())`;
 const insertCase = `INSERT INTO "PortalCase" (id,"doctorId","clinicId","patientId","patientReference",category,notes,"consentAt","updatedAt") VALUES ($1,$2,$3,$4,'SYNTHETIC TEST','Initial case','',now(),now())`;
 try {
  await db.query('BEGIN');
  await db.query(`INSERT INTO "Clinic" (id,name) VALUES ($1,'SYNTHETIC TEST'),($2,'SYNTHETIC TEST')`, [clinic,other]);
  await db.query(`INSERT INTO "Doctor" (id,"clinicId","fullName",email,"passwordHash","updatedAt") VALUES ($1,$2,'SYNTHETIC TEST',$3,'unusable-test-hash',now())`, [doctor,clinic,`${doctor}@example.invalid`]);
  await db.query(insertPatient, [patient,clinic,'TEST-001']);
  await rejects(insertPatient, [randomUUID(),clinic,'TEST-001'], '23505');
  await db.query(insertPatient, [randomUUID(),other,'TEST-001']); passed++;
  await db.query(insertPatient, [randomUUID(),clinic,'TEST-002']); passed++;
  await rejects(insertPatient, [randomUUID(),randomUUID(),'TEST-001'], '23503');
  await db.query(insertCase, [randomUUID(),doctor,clinic,patient]);
  await db.query(insertCase, [randomUUID(),doctor,clinic,patient]); passed++;
  await db.query(insertCase, [randomUUID(),doctor,clinic,null]); passed++;
  await rejects(insertCase, [randomUUID(),doctor,other,patient], '23503');
  await rejects(insertCase, [randomUUID(),doctor,clinic,randomUUID()], '23503');
  await rejects('DELETE FROM "Patient" WHERE id=$1', [patient], '23503');
  await rejects('UPDATE "Patient" SET "clinicId"=$1, "patientCode"=id WHERE id=$2', [other,patient], '23503');
  await rejects('DELETE FROM "Clinic" WHERE id=$1', [other], '23503');
  console.log(`${passed} integrity checks passed: scoped codes, duplicate names allowed, multiple cases, legacy NULL linkage, cross-clinic/missing links rejected, restricted deletes/ownership changes.`);
 } finally { await db.query('ROLLBACK'); await db.end(); console.log('All synthetic fixtures rolled back.'); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });

