// Writes only uniquely identified synthetic fixtures; cleans them in finally.
require('dotenv').config({quiet:true});
const {Client}=require('pg');const {randomUUID,randomBytes,createHash}=require('node:crypto');const {hash}=require('bcryptjs');const assert=require('node:assert/strict');
const base=process.env.PORTAL_TEST_ORIGIN||'http://127.0.0.1:3107';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Tests require a local server.');
const dburl=new URL(process.env.DATABASE_URL);if(!(dburl.port==='5432' && dburl.pathname==='/allen_aligner_codex_test')||!['localhost','127.0.0.1'].includes(dburl.hostname))throw Error('Tests require the isolated local allen-doctor-portal database.');
const db=new Client({options: "-c timezone=UTC", connectionString:process.env.DATABASE_URL});const doctors=[randomUUID(),randomUUID(),randomUUID()];const clinics=[randomUUID(),randomUUID()];const emails=doctors.map(id=>`portal-test-${id}@example.invalid`);const password=randomBytes(20).toString('hex');let checks=0;
async function call(url,body,cookie='',extra={}){if(body&&['submit','approve','adjustment'].includes(body.action)&&body.revision===undefined&&/^\/api\/portal\/cases\/[^/]+$/.test(url)){const current=await fetch(base+url+'/timeline',{headers:{Cookie:cookie}});if(current.ok)body={...body,revision:(await current.json()).case.revision};}return fetch(base+url,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),Origin:base,...(cookie?{Cookie:cookie}:{}),...extra},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});}
function eq(actual,expected,label){assert.equal(actual,expected,label);checks++;console.log('PASS',label);}
async function login(i){const r=await call('/api/doctor-login',{email:emails[i],password});eq(r.status,200,'verified login');const cookie=r.headers.get('set-cookie');assert(cookie.includes('HttpOnly')&&cookie.includes('SameSite=lax'));return cookie.split(';')[0];}
async function main(){await db.connect();try{
 for(let i=0;i<2;i++)await db.query('INSERT INTO "Clinic"(id,name) VALUES($1,$2)',[clinics[i],'Synthetic test clinic']);
 const hashed=await hash(password,12);for(let i=0;i<3;i++)await db.query('INSERT INTO "Doctor"(id,"fullName",email,"passwordHash","clinicId","isVerified","updatedAt") VALUES($1,$2,$3,$4,$5,$6,NOW())',[doctors[i],'Synthetic test doctor',emails[i],hashed,clinics[i===1?1:0],i<2]);
 eq((await call('/doctor-dashboard')).status,307,'anonymous dashboard redirected');
 eq((await call('/api/portal/cases',{})).status,401,'anonymous API denied');
 eq((await call('/api/doctor-login',{email:emails[2],password})).status,403,'unverified doctor denied');
 let a=await login(0),b=await login(1);
 eq((await call('/api/portal/cases',{},a,{Origin:'https://attacker.invalid'})).status,403,'cross-origin mutation denied');
 let r=await call('/api/portal/cases',{patientReference:'SYNTHETIC PORTAL QA',category:'Initial case',notes:'Synthetic test only',consent:'yes'},a);eq(r.status,201,'case draft persisted');const id=(await r.json()).redirect.split('/').pop();const url='/api/portal/cases/'+id;
 eq((await call(url,{action:'comment',text:'unauthorized'},b)).status,404,'other clinic mutation denied');
 eq((await call(url,{action:'submit'},a)).status,409,'empty case cannot submit');
 const invalid=new FormData();invalid.set('file',new Blob(['<script>bad</script>']),'record.pdf');eq((await call(url+'/files',invalid,a)).status,400,'disguised file rejected');
 const form=new FormData();form.set('file',new Blob(['%PDF-1.7\nSynthetic fixture\n%%EOF']),'synthetic.pdf');eq((await call(url+'/files',form,a)).status,201,'private file persisted');
 const file=(await db.query('SELECT id FROM "CaseFile" WHERE "caseId"=$1',[id])).rows[0].id;
 eq((await call('/api/portal/files/'+file)).status,401,'anonymous file download denied');eq((await call('/api/portal/files/'+file,undefined,b)).status,404,'other doctor file download denied');
 r=await call('/api/portal/files/'+file,undefined,a);eq(r.status,200,'owner file download allowed');assert(r.headers.get('content-disposition').startsWith('attachment'));assert(r.headers.get('cache-control').includes('no-store'));
 eq((await call(url,{action:'submit'},a)).status,200,'case submitted');
 const token=randomBytes(32).toString('hex');await db.query('INSERT INTO "LabAccess"("caseId","tokenHash",label,"expiresAt") VALUES($1,$2,$3,NOW()+interval \'1 hour\')',[id,createHash('sha256').update(token).digest('hex'),'Synthetic lab']);
 const lab='/api/lab/cases/'+id;const auth={Authorization:'Bearer '+token};
 eq((await call(lab)).status,401,'lab credentials required');let c=await (await call(lab,undefined,'',auth)).json();eq(c.status,'SUBMITTED','assigned lab sees submitted case');
 eq((await call(lab+'/files/'+file,undefined,'',auth)).status,200,'assigned lab downloads private file');
 eq((await call(lab,{action:'status',status:'IN_PRODUCTION',revision:c.revision},'',auth)).status,409,'lab cannot bypass approval');
 eq((await call(lab,{action:'plan',summary:'Synthetic written plan version one',revision:c.revision},'',auth)).status,200,'lab publishes plan');
 c=await (await call(lab,undefined,'',auth)).json();let plan=c.plans.find(p=>p.version===1);
 eq((await call(url,{action:'adjustment',planId:plan.id,text:'Synthetic adjustment'},a)).status,200,'doctor requests adjustment');
 eq((await call(url,{action:'approve',planId:plan.id},a)).status,409,'reviewed plan cannot be approved again');
 c=await (await call(lab,undefined,'',auth)).json();eq((await call(lab,{action:'plan',summary:'Synthetic written plan version two',revision:c.revision},'',auth)).status,200,'new version published');
 c=await (await call(lab,undefined,'',auth)).json();plan=c.plans.find(p=>p.version===2);
 eq((await call(url,{action:'approve',planId:plan.id},a)).status,200,'current plan approved');
 c=await (await call(lab,undefined,'',auth)).json();eq((await call(lab,{action:'status',status:'IN_PRODUCTION',revision:c.revision-1},'',auth)).status,409,'stale lab update rejected');
 for(const status of ['IN_PRODUCTION','SHIPPED','COMPLETED']){c=await (await call(lab,undefined,'',auth)).json();eq((await call(lab,{action:'status',status,revision:c.revision},'',auth)).status,200,'lifecycle '+status);}
 c=await (await call(lab,undefined,'',auth)).json();eq((await call(lab,{action:'comment',text:'Synthetic lab response',revision:c.revision},'',auth)).status,200,'lab response persisted');
 const notification=(await db.query('SELECT id FROM "Notification" WHERE "doctorId"=$1 LIMIT 1',[doctors[0]])).rows[0].id;
 eq((await call('/api/portal/notifications',{id:notification},b)).status,404,'other doctor notification denied');eq((await call('/api/portal/notifications',{id:notification},a)).status,200,'notification marked read');
 // Same clinic still does not imply access to another doctor's case.
 await db.query('UPDATE "Doctor" SET "clinicId"=$1 WHERE id=$2',[clinics[0],doctors[1]]);eq((await call(url,{action:'comment',text:'same clinic unauthorized'},b)).status,404,'same-clinic unassigned doctor denied');
 for(const route of ['/','/about','/for-doctors','/how-it-works','/doctor-login','/doctor-register','/clinic/dashboard','/doctor-dashboard','/doctor-dashboard/cases','/doctor-dashboard/cases/new','/doctor-dashboard/patients','/doctor-dashboard/plans','/doctor-dashboard/documents','/doctor-dashboard/notifications','/doctor-dashboard/cases/'+id]){r=await call(route,undefined,a);eq(r.status,['/doctor-login','/doctor-register'].includes(route)?307:200,'route '+route);const html=await r.text();assert(!html.includes('NEXT_HTTP_ERROR_FALLBACK;500'));}
 r=await call('/doctor-dashboard/cases/'+id,undefined,b);const denied=await r.text();eq(denied.includes('SYNTHETIC PORTAL QA'),false,'other doctor detail contains no patient reference');assert(denied.includes('could not be found')); // Next streamed notFound responses can use HTTP 200.
 if(process.env.PORTAL_BROWSER_QA==='true'){
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({headless:true,args:['--no-proxy-server'],...(process.env.PORTAL_BROWSER_CHANNEL?{channel:process.env.PORTAL_BROWSER_CHANNEL}:{})});try{const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto(base+'/doctor-login',{waitUntil:'domcontentloaded',timeout:60000});await page.getByLabel('Email address').fill(emails[0]);await page.locator('#password').fill(password);await page.getByRole('button',{name:'Sign in →'}).click();await page.waitForURL('**/doctor-dashboard');await page.goto(base+'/doctor-dashboard/cases/'+id,{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('heading',{name:'Doctor–lab conversation'}).waitFor();await page.waitForTimeout(1500);await page.screenshot({path:process.env.PORTAL_SCREENSHOT||'portal-qa.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(1000);eq(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile page fits viewport');eq(errors.filter(e=>/hydration|did not match|uncaught/i.test(e)).length,0,'no browser hydration/runtime errors');await context.close();}finally{await browser.close();}
 }
 eq((await call('/api/doctor-logout',{},a)).status,303,'logout completed');eq((await call('/api/portal/files/'+file,undefined,a)).status,401,'revoked session rejected');
 b=await login(1);await db.query('UPDATE "DoctorSession" SET "expiresAt"=NOW()-interval \'1 minute\' WHERE "doctorId"=$1',[doctors[1]]);eq((await call('/api/portal/cases',{},b)).status,401,'expired session rejected');
 console.log(`Completed ${checks} integration checks.`);
 }finally{
 await db.query('DELETE FROM "PortalCase" WHERE "doctorId"=ANY($1::text[])',[doctors]);await db.query('DELETE FROM "Doctor" WHERE id=ANY($1::text[])',[doctors]);await db.query('DELETE FROM "Clinic" WHERE id=ANY($1::text[])',[clinics]);
 for(const email of emails)await db.query('DELETE FROM "LoginThrottle" WHERE key=$1',['login:'+createHash('sha256').update(email).digest('hex')]);await db.end();console.log('Synthetic fixtures removed.');
 }}main().catch(e=>{console.error(e);process.exitCode=1;});


