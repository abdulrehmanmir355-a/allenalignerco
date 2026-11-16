const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root='C:/Users/NZ/Desktop/AllenAligner/allen-aligner';
const req=require('node:module').createRequire(path.join(root,'package.json'));
req('dotenv').config({path:path.join(root,'.env'),quiet:true});
req('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
const {Client}=req('pg');
const rawUrl=process.env.DATABASE_URL;
if(!rawUrl)throw Error('DATABASE_URL is not configured; no changes made.');
const url=new URL(rawUrl),database=decodeURIComponent(url.pathname.slice(1));
if(!['localhost','127.0.0.1','::1'].includes(url.hostname)||database!=='allen_aligner')throw Error('Expected the local allen_aligner database; no changes made.');
const pgBin=process.env.PG_BIN||'C:/Program Files/PostgreSQL/17/bin';
const backupDir=path.join(root,'.private','database-backups');fs.mkdirSync(backupDir,{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=path.join(backupDir,`allen-aligner-audit-team-access-${stamp}.dump`);
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:database};
function run(exe,args){const result=spawnSync(path.join(pgBin,`${exe}.exe`),args,{env,encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(`${exe} failed; migration was not applied.`);return result;}
run('pg_dump',['--format=custom','--no-owner','--no-privileges','--file',backup]);
const listing=run('pg_restore',['--list',backup]).stdout;
if(!listing.includes('HRUser')||!listing.includes('InternalAuditPlan'))throw Error('Database backup validation failed; migration was not applied.');
const db=new Client({connectionString:url.toString()});
(async()=>{
 await db.connect();
 try{
  const [base]=(await db.query(`SELECT to_regclass('public."HRUser"') AS hr,to_regclass('public."InternalAuditPlan"') AS audits`)).rows;
  if(!base.hr||!base.audits)throw Error('Required HR and audit tables are missing; migration was not applied.');
  const [before]=(await db.query(`SELECT (SELECT count(*)::text FROM "HRUser") AS users,(SELECT count(*)::text FROM "InternalAuditPlan") AS audits`)).rows;
  const migration=fs.readFileSync(path.join(root,'database','migrations','20261031140000_audit_team_access.sql'),'utf8');
  await db.query(migration);
  const [constraint]=(await db.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='"HRUser"'::regclass AND conname='HRUser_role_check'`)).rows;
  if(!constraint?.definition?.includes('AUDIT_TEAM'))throw Error('Role constraint verification failed.');
  const required=['AuditTeamInvitation','AuditTeamSession','AuditTeamAccessEvent'];
  for(const table of required){const [{exists}]=(await db.query('SELECT to_regclass($1) IS NOT NULL AS exists',[`public."${table}"`])).rows;if(!exists)throw Error(`Schema verification failed for ${table}.`);}
  const [after]=(await db.query(`SELECT (SELECT count(*)::text FROM "HRUser") AS users,(SELECT count(*)::text FROM "InternalAuditPlan") AS audits`)).rows;
  if(before.users!==after.users||before.audits!==after.audits)throw Error('Existing HR or audit records changed unexpectedly.');
  console.log(JSON.stringify({database,migrationApplied:true,verifiedTables:required,preservedRecordCounts:{HRUser:before.users,InternalAuditPlan:before.audits}}));
 }finally{await db.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
