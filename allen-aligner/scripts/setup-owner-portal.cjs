require('dotenv').config({ path: '.env', quiet: true });
require('dotenv').config({ path: '.env.local', override: true, quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const url = process.env.OWNER_DATABASE_URL;
if (!url) throw new Error('OWNER_DATABASE_URL is missing.');
(async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const sql = fs.readFileSync(path.join(process.cwd(), 'database/migrations/20261030130000_owner_portal.sql'), 'utf8');
    await client.query(sql);
    console.log('Owner portal schema is ready.');
  } finally { await client.end(); }
})().catch(error => { console.error('Owner portal setup failed:', error.code || error.message); process.exitCode = 1; });
