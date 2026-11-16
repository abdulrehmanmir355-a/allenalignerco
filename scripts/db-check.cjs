require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
(async () => {
 const pool = new Pool({options: "-c timezone=UTC",  connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
 try {
  const result = await pool.query('SELECT current_database() AS database, current_setting(\'server_version\') AS version');
  const required = ['Doctor','Clinic','Patient','PatientHistory','PortalCase','CaseFile','LargeUploadSession','LargeUploadChunk','LargeClinicalFile'];
  for (const table of required) {
   const found = await pool.query('SELECT to_regclass($1) AS name', ['"'+table+'"']);
   if (!found.rows[0].name) throw Error('Missing table: '+table);
  }
  console.log('PostgreSQL connection OK:', result.rows[0]);
  console.log('Required tables present. Private uploads:', process.env.ENABLE_PRIVATE_UPLOADS === 'true' ? 'enabled' : 'disabled');
 } finally { await pool.end(); }
})().catch(error => { console.error('Database check failed:', error.code || error.message); process.exitCode = 1; });
