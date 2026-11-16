// Read-only fingerprint of existing tables; no patient contents are printed.
require('dotenv').config({quiet:true});
const {Client}=require('pg');
const {writeFileSync,readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const url=new URL(process.env.DATABASE_URL);
assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.port==='51218');
const tables=['Doctor','Clinic','DoctorSession','LoginThrottle','PortalCase','CaseEvent','CaseFile','TreatmentPlan','CaseMessage','Notification','LabAccess','Patient'];
async function main(){const db=new Client({options: "-c timezone=UTC", connectionString:process.env.DATABASE_URL});await db.connect();try{const result={};for(const table of tables){const row=(await db.query(`SELECT count(*)::int AS count, md5(COALESCE(string_agg(fingerprint, '' ORDER BY fingerprint), '')) AS hash FROM (SELECT md5(row_to_json(t)::text) AS fingerprint FROM "${table}" t) s`)).rows[0];result[table]=row;}
if(process.argv[2]==='check'){assert.deepEqual(result,JSON.parse(readFileSync(process.argv[3],'utf8')));console.log('All 12 existing tables unchanged.');}else{writeFileSync(process.argv[3],JSON.stringify(result,null,2));console.log('Read-only fingerprints recorded for 12 existing tables.');}}finally{await db.end();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
