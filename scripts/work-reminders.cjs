// Run hourly with the host scheduler; uses the existing project's protected .env.
const path=require('path');
require('dotenv').config({path:path.join(__dirname,'..','.env'),quiet:true});
const {Client}=require('pg');
(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:60000});await c.connect();try{const r=await c.query('SELECT aa_send_work_reminders() AS delivered');console.log(new Date().toISOString(),JSON.stringify(r.rows[0]));}finally{await c.end();}})().catch(e=>{console.error('Work reminder check failed:',e.code||e.name);process.exitCode=1;});
