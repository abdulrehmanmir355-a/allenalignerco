const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),{randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'..'),req=require('node:module').createRequire(path.join(root,'package.json'));
req('dotenv').config({path:path.join(root,'.env'),quiet:true});req('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
const {Client}=req('pg'),url=new URL(process.env.DATABASE_URL||''),database=decodeURIComponent(url.pathname.slice(1));
if(!['localhost','127.0.0.1'].includes(url.hostname)||database!=='allen_aligner')throw Error('Expected the local allen_aligner database; no changes made.');
const stamp=new Date().toISOString().slice(0,10).replaceAll('-','')+'_'+randomBytes(4).toString('hex'),testName='allen_aligner_plan_test_'+stamp;
const backupDir=path.join(root,'.private','database-backups');fs.mkdirSync(backupDir,{recursive:true});const backup=path.join(backupDir,`allen-aligner-plan-versions-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`);
const bin=(process.env.PG_BIN||'C:/Program Files/PostgreSQL/17/bin').replace(/[\\/]?$/,'/'),env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:database};
function run(name,args,runEnv=env){const r=spawnSync(path.join(bin,name+'.exe'),args,{env:runEnv,encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(name+' failed: '+(r.stderr||r.error?.message||'unknown error'));return r;}
const report={database,testDatabase:testName,backup,backupValidated:false,migrationTested:false,liveMigrationApplied:false};
(async()=>{let admin;try{
 run('pg_dump',['--format=custom','--no-owner','--no-privileges','--file',backup]);
 const listing=run('pg_restore',['--list',backup]);if(!listing.stdout.includes('TreatmentPlan')||!listing.stdout.includes('ClinicalReview'))throw Error('Backup archive missing clinical schema; no migration applied.');report.backupValidated=true;
 admin=new Client({connectionString:url.toString()});await admin.connect();await admin.query(`CREATE DATABASE "${testName}"`);
 run('pg_restore',['--no-owner','--no-privileges','--dbname',testName,backup]);
 const testUrl=new URL(url);testUrl.pathname='/'+testName;const isolated=new Client({connectionString:testUrl.toString()});await isolated.connect();try{const migration=fs.readFileSync(path.join(root,'database/migrations/20261029120000_plan_revision_integrity.sql'),'utf8');await isolated.query(migration);await isolated.query(migration);}finally{await isolated.end();}
 const checks=spawnSync(process.execPath,[path.join(root,'scripts/plan-version-control-db.test.cjs')],{cwd:root,env:{...process.env,PLAN_VERSION_TEST_DATABASE_URL:testUrl.toString()},encoding:'utf8',windowsHide:true});process.stdout.write(checks.stdout||'');if(checks.status!==0){process.stderr.write(checks.stderr||'');throw Error('Isolated plan-version database checks failed. Live database was not migrated.');}report.migrationTested=true;
 if(process.argv.includes('--apply')){const live=new Client({connectionString:url.toString()});await live.connect();try{await live.query(fs.readFileSync(path.join(root,'database/migrations/20261029120000_plan_revision_integrity.sql'),'utf8'));const cols=await live.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='TreatmentPlan' AND column_name=ANY($1::text[])`,[['changeSummary','createdByRole','createdById','authorName','parentPlanId','approvedByDoctorId','approvedAt']]);if(cols.rows[0].n!==7)throw Error('Live migration verification failed.');report.liveMigrationApplied=true;}finally{await live.end();}}
 console.log(JSON.stringify(report));
 }finally{if(admin){await admin.query(`DROP DATABASE IF EXISTS "${testName}" WITH (FORCE)`).catch(()=>{});await admin.end();}}})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
