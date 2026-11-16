const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict'),{randomBytes,createHash}=require('node:crypto');
const root=process.env.ALLEN_PROJECT_ROOT||path.resolve(__dirname,'..'),req=require('node:module').createRequire(root+'/package.json');
req('dotenv').config({path:root+'/.env.local',quiet:true});req('dotenv').config({path:root+'/.env',quiet:true});
const url=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/allen_aligner')throw Error('Unexpected database; no changes made.');
const apply=process.argv.includes('--apply');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),dir=root+'/.private/database-backups';fs.mkdirSync(dir,{recursive:true});
const backup=dir+'/allen-invitations-'+stamp+'.dump',bin=(process.env.PG_BIN||'C:/Program Files/PostgreSQL/17/bin').replace(/[\\\/]?$/,'/');
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:'allen_aligner'};
let result=spawnSync(bin+'pg_dump.exe',['--format=custom','--no-owner','--no-privileges','--file',backup],{env,encoding:'utf8',windowsHide:true});
if(result.status!==0)throw Error('Backup failed; no migration applied.');
result=spawnSync(bin+'pg_restore.exe',['--list',backup],{encoding:'utf8',windowsHide:true});
if(result.status!==0||!result.stdout.includes('Employee'))throw Error('Backup archive validation failed.');
const {Client}=req('pg'),name='allen_aligner_invitation_test_'+new Date().toISOString().slice(0,10).replaceAll('-','')+'_'+randomBytes(4).toString('hex');
const migration=fs.readFileSync(root+'/database/migrations/20261026190000_employee_invitation_codes.sql','utf8');
const report={backup,backupValidated:true,testDatabase:name,applied:false};
async function snapshot(c){return {employees:(await c.query('SELECT * FROM "Employee" ORDER BY id')).rows,accounts:(await c.query(`SELECT to_jsonb(w)-'registrationTokenHash'-'registrationExpiresAt' AS row FROM "WorkAccount" w ORDER BY id`)).rows,sequence:(await c.query('SELECT last_value,is_called FROM aa_employee_number')).rows};}
(async()=>{const live=new Client({connectionString:url.toString()});await live.connect();try{
const before=await snapshot(live);
await live.query('CREATE DATABASE "'+name+'"');
result=spawnSync(bin+'pg_restore.exe',['--no-owner','--no-privileges','--dbname',name,backup],{env:{...env,PGDATABASE:name},encoding:'utf8',windowsHide:true});
if(result.status!==0)throw Error('Restore into isolated verification database failed; actual database unchanged.');
const testUrl=new URL(url);testUrl.pathname='/'+name;
const isolated=new Client({connectionString:testUrl.toString()});await isolated.connect();try{await isolated.query(migration);await isolated.query(migration);}finally{await isolated.end()}
result=spawnSync(process.execPath,[root+'/scripts/invitation-codes-integration.cjs'],{cwd:root,env:{...process.env,INVITATION_TEST_DATABASE_URL:testUrl.toString()},encoding:'utf8',windowsHide:true});
process.stdout.write(result.stdout||'');if(result.status!==0){process.stderr.write(result.stderr||'');throw Error('Invitation workflow verification failed; actual database unchanged.');}
report.isolatedWorkflowPassed=true;report.repeatMigrationPassed=true;
assert.deepEqual(await snapshot(live),before);
if(apply){await live.query(migration);assert.deepEqual(await snapshot(live),before);report.applied=true;report.actualEmployeeRecordsUnchanged=true;report.actualAccountCredentialsUnchanged=true;report.actualSequenceUnchanged=true;}
if(!process.argv.includes('--keep-test-db')){await live.query('DROP DATABASE \"'+name+'\"');report.testDatabaseRemoved=true;}
report.migrationSHA256=createHash('sha256').update(migration).digest('hex');
fs.writeFileSync(root+'/.private/invitation-verification-'+stamp+'.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
}finally{await live.end()}})().catch(error=>{console.error(error.code||'',error.message);process.exitCode=1});
