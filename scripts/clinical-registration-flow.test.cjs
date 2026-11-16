const { randomUUID, createHash, randomBytes } = require("node:crypto");
const { Client } = require("pg");
const bcrypt = require("bcryptjs");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const url = process.env.LOCAL_DATABASE_URL;
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") throw new Error("Refusing non-local database.");
const base = process.env.CLINICAL_TEST_BASE || "http://127.0.0.1:3219";
const hash = value => createHash("sha256").update(value).digest("hex");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(pathname, body) {
  const response = await fetch(base + pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify(body),
  });
  const setCookie = response.headers.get("set-cookie") || "";
  const payload = await response.json();
  return { status: response.status, payload, setCookie };
}

(async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  const stamp = Date.now().toString().slice(-6);
  const email = `clinical.flow.${stamp}@example.com`;
  const otherEmail = `clinical.other.${stamp}@example.com`;
  const employeeId = randomUUID();
  const password = "ClinicalPass123";
  let permanentId = "";
  const created = [];
  try {
    const [employee] = (await client.query(
      `INSERT INTO "Employee"(id,"employeeCode","fullName",email,department,designation,"joinedOn",phone,status)
       VALUES($1,'',$2,$3,'Clinical Affairs','Reviewer',CURRENT_DATE,'5550100','ACTIVE')
       RETURNING id,"permanentId"`,
      [employeeId, "Flow Employee " + stamp, email],
    )).rows;
    permanentId = employee.permanentId;
    created.push(employee.id);
    const [other] = (await client.query(
      `INSERT INTO "Employee"(id,"employeeCode","fullName",email,department,designation,"joinedOn",phone,status)
       VALUES($1,'',$2,$3,'Clinical Affairs','Reviewer',CURRENT_DATE,'5550101','ACTIVE')
       RETURNING id,"permanentId"`,
      [randomUUID(), "Other Employee " + stamp, otherEmail],
    )).rows;
    created.push(other.id);

    const unknown = await api("/api/clinical/employee-registration", { action: "register", employeeId: "AA-EMP-999999", email, password, confirmPassword: password, role: "REVIEWER" });
    assert(unknown.status === 403, "unknown employee should be rejected, got " + unknown.status);
    assert(!unknown.setCookie.includes("allen_work_session"), "unknown registration set a session");

    const mismatch = await api("/api/clinical/employee-registration", { action: "register", employeeId: permanentId, email: "wrong." + email, password, confirmPassword: password, role: "REVIEWER" });
    assert(mismatch.status === 403, "email mismatch should be rejected");

    const pending = await api("/api/clinical/employee-registration", { action: "register", employeeId: permanentId, email, password, confirmPassword: password, role: "REVIEWER", reason: "Needs review access" });
    assert(pending.status === 202, "standard registration should be accepted as pending, got " + pending.status + " " + JSON.stringify(pending.payload));
    assert(pending.payload.status === "PENDING_APPROVAL", "status should be pending approval");
    assert(!pending.setCookie.includes("allen_work_session"), "pending registration created a session");
    const duplicate = await api("/api/clinical/employee-registration", { action: "register", employeeId: permanentId, email, password, confirmPassword: password, role: "REVIEWER" });
    assert(duplicate.status === 202 && /awaiting authorized approval/i.test(duplicate.payload.message), "duplicate should report the real pending status");

    const pendingLogin = await api("/api/clinical/employee-session", { employeeId: permanentId, password });
    assert(pendingLogin.status === 403, "pending employee should not log in, got " + pendingLogin.status);
    assert(!pendingLogin.setCookie.includes("allen_work_session"), "pending login created a session");

    const badCode = await api("/api/clinical/employee-registration", { action: "register", employeeId: other.permanentId, email: otherEmail, invitationCode: "a".repeat(64), password, confirmPassword: password });
    assert(badCode.status === 400, "invalid invitation should fail");

    const token = randomBytes(32).toString("hex");
    const [hr] = (await client.query(`SELECT id FROM "HRUser" WHERE "isActive"=true LIMIT 1`)).rows;
    assert(hr, "an HR user is required for the invitation fixture");
    await client.query(`DELETE FROM "ClinicalRegistrationRequest" WHERE "employeeId"=$1 AND status='PENDING_APPROVAL'`, [other.id]);
    await client.query(
      `INSERT INTO "ClinicalAccessInvitation"("employeeId",email,department,"jobTitle",role,"tokenHash","expiresAt","issuedBy",reason)
       VALUES($1,$2,'Clinical Affairs','Reviewer','REVIEWER',$3,clock_timestamp()+interval '24 hours',$4,'Flow test')`,
      [other.id, otherEmail, hash(token), hr.id],
    );
    await client.query(
      `INSERT INTO "ClinicalRegistrationRequest"("employeeId","accountId",email,"fullName",department,"jobTitle","employeeStatus","requestedRole",pathway,status)
       SELECT $1,w.id,$2,e."fullName",e.department,e.designation,e.status,'REVIEWER','HR_INVITATION','INVITED'
       FROM "Employee" e JOIN "WorkAccount" w ON w."employeeId"=e.id WHERE e.id=$1`,
      [other.id, otherEmail],
    );
    const expiredToken = randomBytes(32).toString("hex");
    await client.query(`UPDATE "ClinicalAccessInvitation" SET status='REVOKED' WHERE "employeeId"=$1`, [other.id]);
    await client.query(
      `INSERT INTO "ClinicalAccessInvitation"("employeeId",email,department,"jobTitle",role,"tokenHash","expiresAt","issuedBy",status,reason)
       VALUES($1,$2,'Clinical Affairs','Reviewer','REVIEWER',$3,clock_timestamp()-interval '1 hour',$4,'EXPIRED','Expired flow')`,
      [other.id, otherEmail, hash(expiredToken), hr.id],
    );
    const expired = await api("/api/clinical/employee-registration", { action: "register", employeeId: other.permanentId, email: otherEmail, invitationCode: expiredToken, password, confirmPassword: password });
    assert(expired.status === 400 && /expired|invalid/i.test(expired.payload.message), "expired invitation should be rejected: " + expired.payload.message);
    await client.query(`DELETE FROM "ClinicalAccessInvitation" WHERE "employeeId"=$1`, [other.id]);
    await client.query(
      `INSERT INTO "ClinicalAccessInvitation"("employeeId",email,department,"jobTitle",role,"tokenHash","expiresAt","issuedBy",reason)
       VALUES($1,$2,'Clinical Affairs','Reviewer','REVIEWER',$3,clock_timestamp()+interval '24 hours',$4,'Flow test')`,
      [other.id, otherEmail, hash(token), hr.id],
    );
    const invited = await api("/api/clinical/employee-registration", { action: "register", employeeId: other.permanentId, email: otherEmail, invitationCode: token, password, confirmPassword: password });
    assert(invited.status === 201 && invited.payload.status === "APPROVED", "valid invitation should approve without a session: " + JSON.stringify(invited.payload));
    assert(!invited.setCookie.includes("allen_work_session"), "invitation registration created a session");
    const reused = await api("/api/clinical/employee-registration", { action: "register", employeeId: other.permanentId, email: otherEmail, invitationCode: token, password, confirmPassword: password });
    assert(reused.status === 409 || reused.status === 400, "reused invitation should fail, got " + reused.status);

    const approvedLogin = await api("/api/clinical/employee-session", { employeeId: other.permanentId, password });
    assert(approvedLogin.status === 200, "approved employee should log in: " + JSON.stringify(approvedLogin.payload));
    assert(approvedLogin.setCookie.includes("allen_work_session"), "approved login should create a session");

    await client.query(`UPDATE "ClinicalRegistrationRequest" SET status='SUSPENDED' WHERE "employeeId"=$1`, [other.id]);
    await client.query(`UPDATE "WorkAccount" SET "clinicalRole"=NULL WHERE "employeeId"=$1`, [other.id]);
    const suspended = await api("/api/clinical/employee-session", { employeeId: other.permanentId, password });
    assert(suspended.status === 403 && !suspended.setCookie.includes("allen_work_session="), "suspended employee should not receive a session");

    await client.query(`UPDATE "ClinicalRegistrationRequest" SET status='REJECTED' WHERE "employeeId"=$1`, [created[0]]);
    await client.query(`UPDATE "WorkAccount" SET "isActive"=true,"passwordHash"=$2,"mustChangePassword"=false,"clinicalRole"='REVIEWER' WHERE "employeeId"=$1`, [created[0], await bcrypt.hash(password, 4)]);
    const rejected = await api("/api/clinical/employee-session", { employeeId: permanentId, password });
    assert(rejected.status === 403, "rejected employee should not log in");

    const resetUnknown = await api("/api/clinical/password-reset", { action: "request", email: "nobody." + email });
    const resetKnown = await api("/api/clinical/password-reset", { action: "request", email });
    assert(resetUnknown.status === 200 && resetKnown.status === 200, "reset responses should both succeed");
    assert(resetUnknown.payload.message === resetKnown.payload.message, "reset must not reveal whether the email exists");
    const stale = await api("/api/clinical/password-reset", { action: "confirm", token: "b".repeat(64), password: "NewClinicalPass123", confirmPassword: "NewClinicalPass123" });
    assert(stale.status === 400, "expired or unknown reset token should fail");

    const guard = await fetch(base + "/api/clinical/reviews", { headers: { Origin: base } });
    assert(guard.status === 401 || guard.status === 403, "clinical API should reject an anonymous caller, got " + guard.status);

    console.log("clinical registration flow checks passed");
  } finally {
    await client.query(`DELETE FROM "WorkSession" WHERE "accountId" IN (SELECT id FROM "WorkAccount" WHERE "employeeId"=ANY($1::text[]))`, [created]);
    await client.query(`DELETE FROM "ClinicalPasswordReset" WHERE "accountId" IN (SELECT id FROM "WorkAccount" WHERE "employeeId"=ANY($1::text[]))`, [created]);
    await client.query(`DELETE FROM "ClinicalSecurityEvent" WHERE "employeeId"=ANY($1::text[])`, [created]);
    await client.query(`DELETE FROM "ClinicalOutboundEmail" WHERE "toAddress"=ANY($1::text[])`, [[email, otherEmail]]);
    await client.query(`DELETE FROM "ClinicalRegistrationRequest" WHERE "employeeId"=ANY($1::text[])`, [created]);
    await client.query(`DELETE FROM "ClinicalAccessInvitation" WHERE "employeeId"=ANY($1::text[])`, [created]);
    await client.query(`DELETE FROM "WorkAccount" WHERE "employeeId"=ANY($1::text[])`, [created]);
    await client.query(`DELETE FROM "Employee" WHERE id=ANY($1::text[])`, [created]);
    await client.end();
  }
})().catch(error => { console.error(error); process.exit(1); });
