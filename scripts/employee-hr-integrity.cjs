// Read-only integrity checks. No fixture creation, updates, deletes, or schema changes.
const fs=require('node:fs'),path=require('node:path');
const root=process.env.ALLEN_PROJECT_ROOT||path.resolve(__dirname,'..');
const req=require('node:module').createRequire(path.join(root,'package.json'));
req('dotenv').config({path:path.join(root,'.env'),quiet:true});req('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
const {Client}=req('pg');
const quote=s=>'"'+s.replaceAll('"','""')+'"';
async function inspect(db){
 const database=(await db.query('SELECT current_database() AS database')).rows[0].database;
 const required=(await db.query(`SELECT count(*)::int total, count(*) FILTER (WHERE id IS NULL OR btrim(id)='')::int "missingId",count(*) FILTER (WHERE "employeeCode" IS NULL OR btrim("employeeCode")='')::int "missingCode",count(*) FILTER (WHERE "permanentId" IS NULL OR btrim("permanentId")='')::int "missingPermanentId", count(*) FILTER (WHERE email IS NULL OR btrim(email)='' OR "joinedOn" IS NULL OR btrim("fullName")='' OR btrim(department)='' OR btrim(designation)='' OR "createdAt" IS NULL OR "updatedAt" IS NULL)::int "missingRequiredFields" FROM public."Employee"`)).rows[0];
 const duplicates={};for(const col of ['id','employeeCode','permanentId'])duplicates[col]=(await db.query('SELECT count(*)::int n FROM (SELECT '+quote(col)+' FROM public."Employee" GROUP BY '+quote(col)+' HAVING count(*)>1) x')).rows[0].n;
 const ledger=(await db.query(`SELECT count(*)::int mismatches FROM public."EmployeeIdentityLedger" l LEFT JOIN public."Employee" e ON e.id=l."employeeId" AND e."permanentId"=l.number WHERE e.id IS NULL`)).rows[0].mismatches;
 const fks=(await db.query(`SELECT c.conname,c.convalidated, c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent,array_agg(ca.attname::text ORDER BY k.n) AS "childColumns",array_agg(pa.attname::text ORDER BY k.n) AS "parentColumns" FROM pg_constraint c JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY AS k(child_att,parent_att,n) ON true JOIN pg_attribute ca ON ca.attrelid=c.conrelid AND ca.attnum=k.child_att JOIN pg_attribute pa ON pa.attrelid=c.confrelid AND pa.attnum=k.parent_att WHERE c.contype='f' AND c.connamespace='public'::regnamespace AND (c.confrelid IN ('public."Employee"'::regclass,'public."HRUser"'::regclass) OR c.conrelid::regclass::text LIKE '%Employee%' OR c.conrelid::regclass::text LIKE '%HR%' OR c.conrelid::regclass::text LIKE '%Offboarding%') GROUP BY c.oid ORDER BY child,c.conname`)).rows;
 const foreignKeys=[];
 for(const fk of fks){
  const present=fk.childColumns.map(c=>'c.'+quote(c)+' IS NOT NULL').join(' AND '),match=fk.childColumns.map((c,i)=>'c.'+quote(c)+'=p.'+quote(fk.parentColumns[i])).join(' AND ');
  const n=(await db.query('SELECT count(*)::int n FROM '+fk.child+' c WHERE '+present+' AND NOT EXISTS (SELECT 1 FROM '+fk.parent+' p WHERE '+match+')')).rows[0].n;
  foreignKeys.push({constraint:fk.conname,child:fk.child,parent:fk.parent,validated:fk.convalidated,orphans:n});
 }
 const tables=(await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).rows.map(r=>r.tablename);
 const counts={};for(const t of ['Employee','HRUser','HROnboarding','EmployeeOffboarding','EmployeeProfileHistory','EmployeePositionHistory','EmployeeHistory','EmployeeRegistrationRequest','ManagementAudit','HRAssetIssue'].filter(t=>tables.includes(t)))counts[t]=(await db.query('SELECT count(*)::int n FROM public.'+quote(t))).rows[0].n;
 const result={database,canonicalTable:'public."Employee"',required,duplicates,ledgerMismatches:ledger,foreignKeys,counts};
 result.passed=Object.entries(required).every(([k,v])=>k==='total'||v===0)&&Object.values(duplicates).every(v=>v===0)&&ledger===0&&foreignKeys.every(f=>f.orphans===0&&f.validated);
 return result;
}
module.exports={inspect};
if(require.main===module)(async()=>{const db=new Client({connectionString:process.env.EMPLOYEE_HR_DATABASE_URL||process.env.DATABASE_URL});await db.connect();try{const report=await inspect(db);console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;}finally{await db.end();}})().catch(e=>{console.error('Integrity check failed:',e.code||e.message);process.exitCode=1});
