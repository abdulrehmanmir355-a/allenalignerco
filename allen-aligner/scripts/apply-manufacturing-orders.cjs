// Backup-first installer for the local Module 16 manufacturing workflow.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
require('dotenv').config({path:path.join(root,'.env'),quiet:true});
require('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
const {Client}=require('pg');

async function main(){
 const raw=process.env.LOCAL_DATABASE_URL;
 if(!raw)throw Error('LOCAL_DATABASE_URL is missing; no database changes made.');
 const url=new URL(raw);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||decodeURIComponent(url.pathname.slice(1))!=='allen_aligner')throw Error('Expected the local allen_aligner database; no database changes made.');
 const db=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000});
 await db.connect();
 try{
  const names=['TreatmentPlanVersionAudit','TreatmentPlan','PortalCase','Doctor','Clinic','ClinicalReview','HRUser','InventoryItem','InventoryStockState','InventoryLocation','InventoryLot','InventoryLocationBalance','InventoryMovement'];
  const present=(await db.query("SELECT x.name,to_regclass('public.'||quote_ident(x.name)) IS NOT NULL AS present FROM unnest($1::text[]) AS x(name)",[names])).rows;
  const missing=present.filter(row=>!row.present).map(row=>row.name);
  if(missing.length)throw Error(`Required approval or inventory setup is missing (${missing.join(', ')}); no database changes made.`);
  const before={};
  for(const table of ['PortalCase','TreatmentPlan','InventoryItem','InventoryMovement']){
   const [{count}]=(await db.query(`SELECT count(*)::text AS count FROM public."${table}"`)).rows;
   before[table]=count;
  }
  const backupDir=process.env.AA_DATABASE_BACKUP_DIR||path.join(process.env.USERPROFILE||root,'Documents','Codex','allen-aligner-backups');
  fs.mkdirSync(backupDir,{recursive:true});
  const backup=path.join(backupDir,`manufacturing-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`);
  const pgBin=process.env.PG_BIN||'C:/Program Files/PostgreSQL/17/bin';
  const pgEnv={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:'allen_aligner'};
  const run=(exe,args)=>{const result=spawnSync(path.join(pgBin,`${exe}.exe`),args,{env:pgEnv,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});if(result.status!==0)throw Error(`${exe} failed: ${result.error?.message??result.stderr?.trim()??`exit ${result.status}`}; no manufacturing migration was applied.`);return result;};
  run('pg_dump',['--format=custom','--no-owner','--no-privileges','--file',backup]);
  const listing=run('pg_restore',['--list',backup]).stdout;
  if(!listing.includes('HRUser')||!listing.includes('PortalCase'))throw Error('Database backup validation failed; no manufacturing migration was applied.');
  const migrations=['20261029200000_production_quality_control.sql','20261113120000_approval_to_manufacturing.sql','20261113130000_manufacturing_case_data_handoff.sql','20261113140000_production_control_stages.sql','20261113150000_production_operator_access.sql','20261114160000_manufacturing_quality_release.sql'];
  for(const migration of migrations)await db.query(fs.readFileSync(path.join(root,'database/migrations',migration),'utf8'));
  const installed=(await db.query(`SELECT to_regclass('public."ProductionQCInspection"') IS NOT NULL AS productionQuality,to_regclass('public."ManufacturingOrder"') IS NOT NULL AS orders,to_regclass('public."ManufacturingOrderMaterial"') IS NOT NULL AS materials,to_regclass('public."ManufacturingOrderReservation"') IS NOT NULL AS reservations,to_regclass('public."ManufacturingOrderAudit"') IS NOT NULL AS audit,to_regclass('public."ManufacturingStageRecord"') IS NOT NULL AS stages,to_regclass('public."ManufacturingQualityReview"') IS NOT NULL AS qualityReviews,EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='aa_production_qc_transition_guard' AND NOT tgisinternal) AS productionQcDispatchGate,EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='aa_create_manufacturing_order_after_doctor_approval' AND NOT tgisinternal) AS trigger,EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='aa_manufacturing_stage_record_immutable' AND NOT tgisinternal) AS stagesAppendOnly,EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='aa_manufacturing_quality_review_immutable' AND NOT tgisinternal) AS qualityReviewsAppendOnly`)).rows[0];
  if(Object.values(installed).some(value=>value!==true))throw Error('Manufacturing schema verification failed after migration.');
  const after={};
  for(const table of Object.keys(before)){
   const [{count}]=(await db.query(`SELECT count(*)::text AS count FROM public."${table}"`)).rows;
   after[table]=count;
   if(count!==before[table])throw Error(`Unexpected existing ${table} record-count change; review the validated backup.`);
  }
  const [{orders}]=(await db.query('SELECT count(*)::int AS orders FROM public."ManufacturingOrder"')).rows;
  console.log(JSON.stringify({database:'local allen_aligner',backup,backupValidated:true,migrations,schema:installed,ordersCreated:orders,preservedRecordCounts:after}));
 }finally{await db.end();}
}
main().catch(error=>{console.error('Manufacturing setup failed:',error instanceof Error?error.message:'Unknown error.');process.exitCode=1;});
