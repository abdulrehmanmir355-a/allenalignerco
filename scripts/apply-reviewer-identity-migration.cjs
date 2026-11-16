const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),{randomBytes}=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),req=Module.createRequire(path.join(root,'package.json'));
req('dotenv').config({path:path.join(root,'.env'),quiet:true});req('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
const {Client}=req('pg'),url=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/allen_aligner')throw Error('Expected the local allen_aligner database. No changes made.');
const bin=(process.env.PG_BIN||'C:/Program Files/PostgreSQL/17/bin').replace(/[\\/]?$/,'/');
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:'allen_aligner'};
const backupDir=path.join(root,'.private','database-backups');fs.mkdirSync(backupDir,{recursive:true});
const backup=path.join(backupDir,`reviewer-identity-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomBytes(3).toString('hex')}.dump`);
function pg(name,args){const r=spawnSync(path.join(bin,name+'.exe'),args,{env,encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(`${name} failed: ${r.stderr||r.error?.message||'unknown error'}`);return r.stdout;}
(async()=>{let client;try{
 pg('pg_dump',['--format=custom','--no-owner','--no-privileges','--file',backup]);
 const listing=pg('pg_restore',['--list',backup]);if(!listing.includes('ClinicalIdentity')||!listing.includes('WorkAccount'))throw Error('Backup validation failed; database unchanged.');
 const migration=fs.readFileSync(path.join(root,'database/migrations/20261029140000_reviewer_independent_identity.sql'),'utf8');
 client=new Client({connectionString:url.toString()});await client.connect();await client.query(migration);
 const {rows}=await client.query(`SELECT pg_get_viewdef('"ClinicalIdentity"'::regclass,true) AS definition`);
 if(rows.length!==1||!rows[0].definition.includes("w.role = 'CLINICAL_ONLY'::text AND w.\"isActive\"")||rows[0].definition.toLowerCase().includes('not exists'))throw Error('ClinicalIdentity view verification failed.');
 console.log(JSON.stringify({database:'allen_aligner',backup,migrationApplied:true,standaloneReviewerIdentityVerified:true}));
}finally{if(client)await client.end();}})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
