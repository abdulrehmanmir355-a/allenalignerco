// Backup-first, additive installation of Internal Audit Management.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const req=require('node:module').createRequire(path.join(root,'package.json'));
req('dotenv').config({path:path.join(root,'.env'),quiet:true});
req('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
const {Client}=req('pg');
const rawUrl=process.env.DATABASE_URL;
if(!rawUrl)throw Error('DATABASE_URL is not configured; no changes made.');
const url=new URL(rawUrl);
const database=decodeURIComponent(url.pathname.slice(1));
if(!['localhost','127.0.0.1','::1'].includes(url.hostname)||database!=='allen_aligner')throw Error('Expected the local allen_aligner database; no changes made.');
const pgBin=process.env.PG_BIN||'C:/Program Files/PostgreSQL/17/bin';
const backupDir=path.join(root,'.private','database-backups');
fs.mkdirSync(backupDir,{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=path.join(backupDir,`allen-aligner-internal-audit-${stamp}.dump`);
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:database};
function run(exe,args){const result=spawnSync(path.join(pgBin,`${exe}.exe`),args,{env,encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(`${exe} failed; migration was not applied. Check local PostgreSQL tools and database access.`);return result;}
run('pg_dump',['--format=custom','--no-owner','--no-privileges','--file',backup]);
const listing=run('pg_restore',['--list',backup]).stdout;
if(!listing.includes('HRUser')||!listing.includes('CAPA'))throw Error('Database backup validation failed; migration was not applied.');
const db=new Client({connectionString:url.toString()});
(async()=>{
 await db.connect();
 try{
  const [base]=(await db.query(`SELECT to_regclass('public."HRUser"') AS hr,to_regclass('public."CAPA"') AS capa`)).rows;
  if(!base.hr||!base.capa)throw Error('Required HRUser and CAPA tables are missing; migration was not applied.');
  const before={};
  for(const table of ['HRUser','CAPA','InternalAuditPlan','InternalAuditChecklistItem','InternalAuditFinding','InternalAuditEvent']){
   const [{exists}]=(await db.query('SELECT to_regclass($1) IS NOT NULL AS exists',[`public."${table}"`])).rows;
   if(exists){const [{count}]=(await db.query(`SELECT count(*)::text AS count FROM public."${table}"`)).rows;before[table]=count;}
  }
  const migration=fs.readFileSync(path.join(root,'database','migrations','20261031120000_internal_audit_management.sql'),'utf8');
  await db.query(migration);
  const installed=(await db.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])`,[['InternalAuditPlan','InternalAuditChecklistItem','InternalAuditFinding','InternalAuditEvent']])).rows;
  const columns=new Map();for(const row of installed){if(!columns.has(row.table_name))columns.set(row.table_name,new Set());columns.get(row.table_name).add(row.column_name);}
  const required={InternalAuditPlan:['id','auditNumber','plannedDate','status','createdBy'],InternalAuditChecklistItem:['auditId','question','response','evidence'],InternalAuditFinding:['auditId','severity','actionPlan','capaId','status'],InternalAuditEvent:['auditId','actorId','action','detail']};
  for(const [table,fields] of Object.entries(required))for(const field of fields)if(!columns.get(table)?.has(field))throw Error(`Schema verification failed for ${table}.${field}.`);
  for(const table of ['HRUser','CAPA']){if(before[table]){const [{after}]=(await db.query(`SELECT count(*)::text AS after FROM public."${table}"`)).rows;if(after!==before[table])throw Error(`Existing ${table} record count changed unexpectedly.`);}}
  console.log(JSON.stringify({database,backup,backupValidated:true,migrationApplied:true,verifiedTables:Object.keys(required),preservedRecordCounts:{HRUser:before.HRUser,CAPA:before.CAPA}}));
 }finally{await db.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
