const { loadEnvConfig } = require("@next/env");
const { Client } = require("pg");

loadEnvConfig(process.cwd(), true);

function describe(raw) {
  const url = new URL(raw);
  return {
    host: url.hostname,
    database: decodeURIComponent(url.pathname.slice(1)),
    local: url.hostname === "127.0.0.1" || url.hostname === "localhost",
  };
}

async function inspect(label, raw) {
  const target = describe(raw);
  const client = new Client({ connectionString: raw, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    const employee = await client.query(`
      SELECT
        e."permanentId" AS employee_id,
        w."clinicalRequest"->>'status' AS request_status,
        w."clinicalRequest"->>'role' AS requested_role,
        w."clinicalRole" AS approved_role
      FROM "ClinicalIdentity" e
      JOIN "WorkAccount" w ON w.id = e."accountId"
      WHERE e."permanentId" = $1
    `, ["AA-EMP-000003"]);
    const count = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE "clinicalRequest"->>'status' = 'PENDING')::int AS pending_requests,
        COUNT(*) FILTER (WHERE "clinicalRole" = 'ADMIN')::int AS clinical_admins
      FROM "WorkAccount"
    `);
    const functions = await client.query(`
      SELECT proname
      FROM pg_proc
      WHERE proname IN ('aa_clinical_db_registration_decide', 'aa_clinical_db_admin_change')
      ORDER BY 1
    `);
    console.log(label);
    console.table([{ ...target, user: undefined }]);
    console.table(employee.rows);
    console.table(count.rows);
    console.log("functions:", functions.rows.map(row => row.proname).join(", ") || "none");
  } finally {
    await client.end();
  }
}

async function main() {
  const local = process.env.LOCAL_DATABASE_URL;
  if (!local) throw new Error("LOCAL_DATABASE_URL is missing");
  const localTarget = describe(local);
  if (!localTarget.local || localTarget.database !== "allen_aligner") {
    throw new Error("LOCAL_DATABASE_URL must point at the local allen_aligner database");
  }
  await inspect("LOCAL DEVELOPMENT", local);
  if (process.argv.includes("--cloud")) {
    const cloud = process.env.DATABASE_URL;
    if (!cloud) throw new Error("DATABASE_URL is missing");
    const cloudTarget = describe(cloud);
    if (cloudTarget.local) throw new Error("DATABASE_URL points at the local database");
    await inspect("NEON CLOUD (read only)", cloud);
  }
}

main().catch(error => {
  console.error("DATABASE CHECK ERROR:", error.message);
  process.exitCode = 1;
});
