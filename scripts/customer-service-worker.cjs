require('dotenv').config({quiet:true});require('dotenv').config({path:'.env.local',override:true,quiet:true});
const {Pool}=require('pg');
(async()=>{const p=new Pool({connectionString:process.env.DATABASE_URL,max:1});try{const r=await p.query('SELECT aa_service_refresh() AS recorded');console.log('New service escalations:',r.rows[0].recorded);}finally{await p.end();}})().catch(e=>{console.error('Customer Service deadline processing failed:',e.code||e.name);process.exitCode=1;});
