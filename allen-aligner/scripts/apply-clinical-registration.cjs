const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const url = process.env.LOCAL_DATABASE_URL;
if (!url) throw new Error("LOCAL_DATABASE_URL is required.");
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") throw new Error("Refusing to migrate a non-local database.");

(async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, "..", "database", "migrations", "20261106_clinical_employee_registration.sql"), "utf8");
  await client.query(sql);
  const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('ClinicalAccessInvitation','ClinicalRegistrationRequest','ClinicalPasswordReset','ClinicalSecurityEvent','ClinicalOutboundEmail') ORDER BY 1`);
  console.log(tables.rows.map(row => row.table_name).join(","));
  await client.end();
})().catch(error => { console.error(error.message); process.exit(1); });
