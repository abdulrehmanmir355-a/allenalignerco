const { Client } = require("pg");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function inspect(label, url) {
  const host = new URL(url).hostname;
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  const summary = { label, host: host === "127.0.0.1" || host === "localhost" ? "local" : "remote", tables: {}, error: null };
  try {
    await client.connect();
    const names = ["ClinicalRegistrationRequest", "ClinicalAccessInvitation", "ClinicalSecurityEvent", "WorkAccount"];
    for (const name of names) {
      const exists = await client.query(`SELECT to_regclass($1) AS rel`, [`public."${name}"`]);
      summary.tables[name] = Boolean(exists.rows[0].rel);
    }
    if (summary.tables.ClinicalRegistrationRequest) {
      const counts = await client.query(`SELECT status, count(*)::int AS n FROM "ClinicalRegistrationRequest" GROUP BY status ORDER BY status`);
      summary.registrationByStatus = counts.rows;
    }
    if (summary.tables.WorkAccount) {
      const roles = await client.query(`SELECT COALESCE("clinicalRole", 'NONE') AS role, count(*)::int AS n FROM "WorkAccount" GROUP BY 1 ORDER BY 1`);
      summary.clinicalRoles = roles.rows;
    }
  } catch (error) {
    summary.error = error instanceof Error ? error.message : "query failed";
  } finally {
    await client.end().catch(() => {});
  }
  return summary;
}

(async () => {
  const reports = [];
  if (process.env.LOCAL_DATABASE_URL) reports.push(await inspect("LOCAL_DATABASE_URL", process.env.LOCAL_DATABASE_URL));
  if (process.env.DATABASE_URL) reports.push(await inspect("DATABASE_URL", process.env.DATABASE_URL));
  console.log(JSON.stringify(reports, null, 2));
})().catch(error => { console.error(error.message); process.exit(1); });
