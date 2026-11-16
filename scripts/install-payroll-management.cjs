// Backup-first, local-only installation of the HR payroll schema.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),req=require('node:module').createRequire(path.join(root,'package.json'));
req('dotenv').config({path:path.join(root,'.env'),quiet:true});
req('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
const {Client}=req('pg'),url=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||decodeURIComponent(url.pathname.slice(1))!=='allen_aligner')throw Error('Expected local allen_aligner database; no changes made.');
const bin=(process.env.PG_BIN||'C:/Program Files/PostgreSQL/17/bin').replace(/[\\/]?$/,'/');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),dir=path.join(process.env.LOCALAPPDATA||root,'AllenAligner','database-backups');fs.mkdirSync(dir,{recursive:true});
const backup=path.join(dir,'allen-aligner-payroll-'+stamp+'.dump');
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:'allen_aligner'};
function run(name,args){const result=spawnSync(path.join(bin,name+'.exe'),args,{env,encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(name+' failed; migration not applied. '+(result.stderr||result.error?.message||''));return result;}
(async()=>{let db;try{
 run('pg_dump',['--format=custom','--no-owner','--no-privileges','--file',backup]);
 const listed=run('pg_restore',['--list',backup]);
 if(!listed.stdout.includes('Employee'))throw Error('Backup validation failed; migration not applied.');
 db=new Client({connectionString:url.toString()});await db.connect();
 const employee=await db.query("SELECT to_regclass('public.\"Employee\"') AS name");
 if(!employee.rows[0].name)throw Error('Required Employee table is missing; migration not applied.');
 await db.query(fs.readFileSync(path.join(root,'database/migrations/20261102120000_hr_payroll_management.sql'),'utf8'));
 const tables=await db.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",[['HRPayrollSalary','HRPayrollSalaryHistory','HRPayrollDraft','HRPayrollDraftAudit']]);
 if(tables.rows[0].count!==4)throw Error('Payroll schema verification failed.');
 console.log(JSON.stringify({database:'allen_aligner',migrationApplied:true,backup,backupValidated:true,tablesVerified:4}));
 }finally{if(db)await db.end();}})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
