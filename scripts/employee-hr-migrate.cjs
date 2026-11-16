// Explicit, backup-first application of the non-destructive employee/HR repair migration.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=process.env.ALLEN_PROJECT_ROOT||path.resolve(__dirname,'..'),req=require('node:module').createRequire(path.join(root,'package.json'));
req('dotenv').config({path:path.join(root,'.env'),quiet:true});req('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
const {Client}=req('pg');
const u=new URL(process.env.EMPLOYEE_HR_DATABASE_URL||process.env.DATABASE_URL);
const name=decodeURIComponent(u.pathname.slice(1));
if(name!=='allen_aligner'&&!/^allen_aligner_hr_verify_\d{8}_[a-f0-9]{8}$/.test(name))throw Error('Expected allen_aligner or a dedicated employee HR verification database.');
if(!process.argv.includes('--apply')){console.log('Use --apply to back up the selected database and apply 20261026120000_employee_hr_integration.sql. No changes made.');process.exit(0);}
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),dir=path.join(root,'.private','database-backups');fs.mkdirSync(dir,{recursive:true});
const file=path.join(dir,name+'-employee-hr-'+stamp+'.dump');
const bin=process.env.PG_BIN||(process.platform==='win32'?'C:/Program Files/PostgreSQL/17/bin':'');
const executable=n=>bin?path.join(bin,n+(process.platform==='win32'?'.exe':'')):n;
const env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:name};
const backup=spawnSync(executable('pg_dump'),['--format=custom','--no-owner','--no-privileges','--file',file],{env,encoding:'utf8',windowsHide:true});
if(backup.status!==0)throw Error('Backup failed; migration was not applied.');
const list=spawnSync(executable('pg_restore'),['--list',file],{encoding:'utf8',windowsHide:true});
if(list.status!==0||!list.stdout.includes('Employee'))throw Error('Backup verification failed; migration was not applied.');
(async()=>{const db=new Client({connectionString:u.toString()});await db.connect();try{
 await db.query(fs.readFileSync(path.join(root,'database/migrations/20261026120000_employee_hr_integration.sql'),'utf8'));
 console.log(JSON.stringify({database:name,migration:'20261026120000_employee_hr_integration.sql',applied:true,backup:file,backupBytes:fs.statSync(file).size,backupValidated:true}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('Migration stopped without a committed schema change:',e.code||'',e.message,e.hint||'');process.exitCode=1;}finally{await db.end();}})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
