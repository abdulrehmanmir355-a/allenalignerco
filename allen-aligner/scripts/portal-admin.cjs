// Local operator tool. Never expose this script as an HTTP route.
require('dotenv').config({quiet:true});
const {Client}=require('pg');const {randomBytes,createHash}=require('node:crypto');
async function main(){const c=new Client({options: "-c timezone=UTC", connectionString:process.env.DATABASE_URL});await c.connect();try{
 const [command,value,label]=process.argv.slice(2);
 if(command==='verify'){
  if(!value)throw Error('Usage: node scripts/portal-admin.cjs verify doctor@example.com');
  const result=await c.query('UPDATE "Doctor" SET "isVerified"=true, "updatedAt"=NOW() WHERE email=$1 RETURNING id',[value.toLowerCase()]);
  console.log(result.rowCount?'Doctor verified. Sign in to provision their private clinic.':'Doctor not found.');
 }else if(command==='revoke'){
  await c.query('BEGIN');await c.query('UPDATE "Doctor" SET "isVerified"=false,"updatedAt"=NOW() WHERE email=$1',[value]);await c.query('DELETE FROM "DoctorSession" WHERE "doctorId" IN (SELECT id FROM "Doctor" WHERE email=$1)',[value]);await c.query('COMMIT');console.log('Access revoked.');
 }else if(command==='assign-lab'){
  if(!value||!label)throw Error('Usage: node scripts/portal-admin.cjs assign-lab CASE_ID "Lab name"');
  const token=randomBytes(32).toString('hex');const hash=createHash('sha256').update(token).digest('hex');
  await c.query(`INSERT INTO "LabAccess" ("caseId","tokenHash",label,"expiresAt") VALUES ($1,$2,$3,NOW()+interval '7 days') ON CONFLICT ("caseId") DO UPDATE SET "tokenHash"=$2,label=$3,"expiresAt"=NOW()+interval '7 days'`,[value,hash,label]);
  console.log('Case-scoped lab token (7 days; store securely; issuing again revokes old token):');console.log(token);
 }else if(command==='revoke-lab'){await c.query('DELETE FROM "LabAccess" WHERE "caseId"=$1',[value]);console.log('Lab access revoked.');}
 else throw Error('Commands: verify EMAIL | revoke EMAIL | assign-lab CASE_ID "Lab name" | revoke-lab CASE_ID');
 }finally{await c.end();}}
main().catch(e=>{console.error(e.message);process.exitCode=1});
