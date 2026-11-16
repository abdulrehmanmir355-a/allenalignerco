// HTTP checks against a local dev server. Session rows are removed afterward.
// This script does not approve, reject, or create a clinical registration.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
require(root + "/node_modules/dotenv").config({ path: path.join(root, ".env"), quiet: true });
require(root + "/node_modules/dotenv").config({ path: path.join(root, ".env.local"), override: true, quiet: true });
const { Client } = require(root + "/node_modules/pg");

const base = process.env.CLINICAL_HTTP_BASE || "http://127.0.0.1:3219";
const origin = new URL(base).origin;

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function api(pathname, { cookie = "", method = "GET", body, originHeader = origin } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (originHeader !== null) headers.Origin = originHeader;
  const response = await fetch(base + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

(async () => {
  const raw = process.env.LOCAL_DATABASE_URL;
  const target = new URL(raw);
  if (!["127.0.0.1", "localhost"].includes(target.hostname) || decodeURIComponent(target.pathname.slice(1)) !== "allen_aligner") {
    throw new Error("HTTP check refused: local allen_aligner is required");
  }
  const client = new Client({ connectionString: raw });
  await client.connect();
  const token = crypto.randomBytes(32).toString("hex");
  let accountId = null;
  try {
    const before = await client.query(`SELECT w."clinicalRequest"->>'status' AS status, w."clinicalRole" AS role FROM "ClinicalIdentity" e JOIN "WorkAccount" w ON w.id=e."accountId" WHERE e."permanentId"='AA-EMP-000003'`);
    assert.equal(before.rows[0].status, "PENDING");
    assert.equal(before.rows[0].role, null);

    const unauthenticated = await api("/api/clinical/registration");
    assert.equal(unauthenticated.status, 401);
    const ownerDenied = await api("/api/owner/clinical/registrations");
    assert.equal(ownerDenied.status, 401);
    const ownerWrite = await api("/api/owner/clinical/registrations", { method: "POST", body: { accountId: crypto.randomUUID(), requestId: crypto.randomUUID(), decision: "APPROVE", reason: "Unauthorized owner decision must fail." } });
    assert.equal(ownerWrite.status, 401);
    const adminWrite = await api("/api/owner/clinical/admin", { method: "POST", body: { employeeId: "AA-EMP-000001", action: "APPOINT", reason: "Unauthorized appointment must fail." } });
    assert.equal(adminWrite.status, 401);

    const [employee] = (await client.query(`SELECT w.id FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE e."permanentId"='AA-EMP-000001' AND w."clinicalRole" IS NULL`)).rows;
    assert.ok(employee, "AA-EMP-000001 must remain a non-administrator for this check");
    accountId = employee.id;
    await client.query(`INSERT INTO "WorkSession"("tokenHash","accountId","expiresAt") VALUES($1,$2,now() + interval '10 minutes')`, [digest(token), accountId]);
    const cookie = `allen_work_session=${token}`;

    const crossSite = await api("/api/clinical/registration", { method: "POST", cookie, originHeader: "https://invalid.example", body: { action: "request", role: "REVIEWER", reason: "Cross-site registration must be rejected." } });
    assert.equal(crossSite.status, 403);

    const suppliedId = await api("/api/clinical/registration", { method: "POST", cookie, body: { action: "request", role: "REVIEWER", reason: "A browser-supplied employee ID must be ignored.", employeeId: "AA-EMP-000003" } });
    assert.equal(suppliedId.status, 400);

    const shortReason = await api("/api/clinical/registration", { method: "POST", cookie, body: { action: "request", role: "REVIEWER", reason: "too short" } });
    assert.equal(shortReason.status, 400);

    const status = await api("/api/clinical/registration", { cookie });
    assert.equal(status.status, 200);
    assert.equal(status.payload.permanentId, "AA-EMP-000001");
    assert.equal(status.payload.clinicalRole ?? null, null);
    assert.equal(status.payload.clinicalRequest ?? null, null);

    const decide = await api("/api/clinical/registration", { method: "POST", cookie, body: { action: "decide", accountId: crypto.randomUUID(), requestId: crypto.randomUUID(), decision: "APPROVE", reason: "An employee without clinical authority must not decide." } });
    assert.equal(decide.status, 403);

    const team = await api("/api/clinical/team", { method: "POST", cookie, body: { employeeId: "AA-EMP-000003", role: "ADMIN", reason: "Ordinary employee must not appoint an administrator." } });
    assert.equal(team.status, 403);

    const pendingToken = crypto.randomBytes(32).toString("hex");
    const [pendingEmployee] = (await client.query(`SELECT w.id FROM "ClinicalIdentity" e JOIN "WorkAccount" w ON w.id=e."accountId" WHERE e."permanentId"='AA-EMP-000003'`)).rows;
    await client.query(`INSERT INTO "WorkSession"("tokenHash","accountId","expiresAt") VALUES($1,$2,now() + interval '10 minutes')`, [digest(pendingToken), pendingEmployee.id]);
    try {
      const pendingStatus = await api("/api/clinical/registration", { cookie: `allen_work_session=${pendingToken}` });
      assert.equal(pendingStatus.status, 200);
      assert.equal(pendingStatus.payload.permanentId, "AA-EMP-000003");
      assert.equal(pendingStatus.payload.clinicalRole ?? null, null);
      assert.equal(pendingStatus.payload.clinicalRequest.status, "PENDING");
      assert.equal(pendingStatus.payload.clinicalRequest.role, "REVIEWER");
    } finally {
      await client.query(`DELETE FROM "WorkSession" WHERE "tokenHash"=$1`, [digest(pendingToken)]);
    }

    const unchanged = await client.query(`SELECT w."clinicalRequest"->>'status' AS status, w."clinicalRole" AS role FROM "ClinicalIdentity" e JOIN "WorkAccount" w ON w.id=e."accountId" WHERE e."permanentId" IN ('AA-EMP-000001','AA-EMP-000003') ORDER BY e."permanentId"`);
    assert.deepEqual(unchanged.rows, [
      { status: null, role: null },
      { status: "PENDING", role: null },
    ]);

    const page = await fetch(base + "/clinical/register");
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.equal(html.includes('name="employeeId"'), false);
    assert.match(html, /Requested clinical role/);
    console.log("PASS http registration checks: auth, origin, no Employee ID, unauthorized decision, pending request preserved");
  } finally {
    if (accountId) await client.query(`DELETE FROM "WorkSession" WHERE "tokenHash"=$1`, [digest(token)]);
    await client.end();
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
