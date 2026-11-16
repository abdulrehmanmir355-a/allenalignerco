// Backup-first, additive installation of the internal CAPA and complaint schemas.
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
const backup=path.join(backupDir,`allen-aligner-quality-${stamp}.dump`);
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:database};
function run(exe,args){const result=spawnSync(path.join(pgBin,`${exe}.exe`),args,{env,encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(`${exe} failed; no schema migrations applied. Check PostgreSQL tools and local database access.`);return result;}
const dump=run('pg_dump',['--format=custom','--no-owner','--no-privileges','--file',backup]);
const listing=run('pg_restore',['--list',backup]).stdout;
if(!listing.includes('PortalCase')||!listing.includes('HRUser'))throw Error('Database backup validation failed; no schema migrations applied.');
const targets=['CAPA','CAPAAudit','QualityComplaint','QualityComplaintAudit'];
const preserve=['HRUser','PortalCase','Employee'];
const db=new Client({connectionString:url.toString()});
(async()=>{
 await db.connect();
 try{
  const [base]= (await db.query(`SELECT to_regclass('public."PortalCase"') AS cases,to_regclass('public."HRUser"') AS hr`)).rows;
  if(!base.cases||!base.hr)throw Error('Required Allen Aligner base tables are missing; no schema migrations applied.');
  const before={};
  for(const table of [...targets,...preserve]){
   const [{exists}]=(await db.query('SELECT to_regclass($1) IS NOT NULL AS exists',[`public."${table}"`])).rows;
   if(exists){const [{count}]=(await db.query(`SELECT count(*)::text AS count FROM public."${table}"`)).rows;before[table]=count;}
  }
  for(const name of ['20261029180000_capa_management.sql','20261029190000_complaint_management.sql']){
   await db.query(fs.readFileSync(path.join(root,'database','migrations',name),'utf8'));
  }
  const installed=(await db.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])`,[['CAPA','CAPAAudit','QualityComplaint','QualityComplaintAudit']])).rows;
  const columns=new Map();for(const row of installed){if(!columns.has(row.table_name))columns.set(row.table_name,new Set());columns.get(row.table_name).add(row.column_name);}
  const required={CAPA:['id','status','severity','dueDate'],CAPAAudit:['capaId','actorId','action'],QualityComplaint:['id','status','caseId','capaId','regulatoryOutcome'],QualityComplaintAudit:['complaintId','actorId','action']};
  for(const [table,fields] of Object.entries(required))for(const field of fields)if(!columns.get(table)?.has(field))throw Error(`Schema verification failed for ${table}.${field}.`);
  for(const [table,count] of Object.entries(before)){const [{after}]=(await db.query(`SELECT count(*)::text AS after FROM public."${table}"`)).rows;if(after!==count)throw Error(`Existing ${table} record count changed unexpectedly.`);}
  console.log(JSON.stringify({database,backup,backupValidated:true,applied:['20261029180000_capa_management.sql','20261029190000_complaint_management.sql'],verifiedTables:Object.keys(required),preservedRecordCounts:before}));
 }finally{await db.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
