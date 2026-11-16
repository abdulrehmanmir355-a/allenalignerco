// Backup-first, additive repair for the employee daily-work reporting schema.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),req=require('node:module').createRequire(path.join(root,'package.json'));
req('dotenv').config({path:path.join(root,'.env'),quiet:true});req('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
const {Client}=req('pg'),url=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||decodeURIComponent(url.pathname.slice(1))!=='allen_aligner')throw Error('Expected the existing local allen_aligner database; no changes made.');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),dir=path.join(root,'.private','database-backups');fs.mkdirSync(dir,{recursive:true});
const backup=path.join(dir,'allen-aligner-work-reporting-'+stamp+'.dump'),bin=process.env.PG_BIN||'C:/Program Files/PostgreSQL/17/bin';
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:'allen_aligner'};
const dump=spawnSync(path.join(bin,'pg_dump.exe'),['--format=custom','--no-owner','--no-privileges','--file',backup],{env,encoding:'utf8',windowsHide:true});
if(dump.status!==0)throw Error('Database backup failed; migration was not applied. '+(dump.stderr||''));
const listed=spawnSync(path.join(bin,'pg_restore.exe'),['--list',backup],{encoding:'utf8',windowsHide:true});
if(listed.status!==0||!listed.stdout.includes('WorkReport'))throw Error('Backup archive validation failed; migration was not applied.');
(async()=>{const db=new Client({connectionString:url.toString()});await db.connect();try{
 const before=await db.query('SELECT count(*)::bigint AS count FROM public."WorkReport"');
 const migration=fs.readFileSync(path.join(root,'database','migrations','20261027191000_employee_work_reporting_fields.sql'),'utf8');
 await db.query(migration);
 const columns=await db.query("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='WorkReport' AND column_name=ANY($1::text[])",[['workStartTime','taskStatus','blockers']]);
 if(columns.rows[0].count!==3)throw Error('Daily work fields were not all installed.');
 const after=await db.query('SELECT count(*)::bigint AS count FROM public."WorkReport"');
 if(before.rows[0].count!==after.rows[0].count)throw Error('Work report row count changed unexpectedly.');
 console.log(JSON.stringify({database:'allen_aligner',migration:'20261027191000_employee_work_reporting_fields.sql',applied:true,backup,backupValidated:true,existingWorkReportRowsPreserved:true,fieldsPresent:true}));
 }finally{await db.end();}})().catch(e=>{console.error(e.code||'',e.message);process.exitCode=1});
