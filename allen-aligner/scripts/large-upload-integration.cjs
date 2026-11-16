// Local-only synthetic accounts; uses the real login and HTTP routes. No auth bypass.
require('dotenv').config({quiet:true});
const {Client}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto'),{hash}=require('bcryptjs'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const base=process.env.PORTAL_TEST_ORIGIN||'http://127.0.0.1:3107',dburl=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname)||!['localhost','127.0.0.1'].includes(dburl.hostname)||!(dburl.port==='5432' && dburl.pathname==='/allen_aligner_codex_test'))throw Error('Synthetic tests require local server and allen-doctor-portal DB.');
const db=new Client({options: "-c timezone=UTC", connectionString:process.env.DATABASE_URL});const clinic=randomUUID(),doctors=[randomUUID(),randomUUID()],emails=doctors.map(id=>'large-upload-'+id+'@example.invalid'),password=randomBytes(24).toString('hex'),uploads=[];let checks=0;
const sha=b=>createHash('sha256').update(b).digest('hex');
function eq(a,b,label){assert.equal(a,b,label);checks++;console.log('PASS '+label);}
async function call(url,method='GET',body,cookie='',headers={}){return fetch(base+url,{method,redirect:'manual',headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(Buffer.isBuffer(body)?{'Content-Type':'application/octet-stream'}:body?{'Content-Type':'application/json'}:{}),...headers},body:Buffer.isBuffer(body)?body:body?JSON.stringify(body):undefined});}
async function main(){await db.connect();try{
 await db.query('INSERT INTO "Clinic"(id,name) VALUES($1,$2)',[clinic,'Synthetic upload clinic']);const hashed=await hash(password,12);
 for(let i=0;i<2;i++)await db.query('INSERT INTO "Doctor"(id,"fullName",email,"passwordHash","clinicId","isVerified","updatedAt") VALUES($1,$2,$3,$4,$5,true,NOW())',[doctors[i],'Synthetic upload doctor',emails[i],hashed,clinic]);
 const cookies=[];for(const email of emails){const r=await call('/api/doctor-login','POST',{email,password});eq(r.status,200,'real verified doctor login');cookies.push(r.headers.get('set-cookie').split(';')[0]);}const [a,b]=cookies;
 const created=await call('/api/portal/cases','POST',{patientReference:'SYNTHETIC LARGE UPLOAD',category:'Initial case',notes:'Synthetic only',consent:'yes'},a);eq(created.status,201,'synthetic case created');const caseId=(await created.json()).redirect.split('/').pop(),url='/api/portal/cases/'+caseId+'/large-uploads';
 const init=async(name,data,expected=sha(data))=>{const r=await call(url,'POST',{name,size:data.length,sha256:expected},a);eq(r.status,201,'initialize '+name);const s=await r.json();uploads.push(s.id);return s;};
 const put=(s,i,data,cookie=a)=>call(url+'/'+s.id+'/chunks/'+i,'PUT',data,cookie,{'X-Chunk-SHA256':sha(data)});
 const finish=s=>call(url+'/'+s.id+'/finalize','POST',{},a);
 eq((await call(url)).status,401,'anonymous listing denied');eq((await call(url,'GET',undefined,b)).status,404,'same-clinic other doctor listing denied');
 eq((await call(url,'POST',{name:'x.pdf',size:10},a,{Origin:'https://attacker.invalid'})).status,403,'cross-origin initialize denied');
 eq((await call(url,'POST',{name:'x.exe',size:10},a)).status,400,'unsupported type denied');eq((await call(url,'POST',{name:'x.pdf',size:1024**3+1},a)).status,400,'over 1 GB rejected');
 // 17 MB binary STL exercises three chunks and a lost-response retry.
 const count=360000,stl=Buffer.alloc(84+50*count);stl.writeUInt32LE(count,80);const s=await init('synthetic-scan.stl',stl),first=stl.subarray(0,s.chunkSize);
 eq((await put(s,0,first,b)).status,404,'other doctor chunk denied');eq((await call(url+'/'+s.id+'/chunks/0','PUT',first,a,{'X-Chunk-SHA256':'0'.repeat(64)})).status,400,'bad chunk checksum rejected');
 eq((await put(s,0,first)).status,200,'first chunk uploaded');eq((await put(s,0,first)).status,200,'retry same chunk idempotent');
 const changed=Buffer.from(first);changed[0]=1;eq((await put(s,0,changed)).status,409,'conflicting retry rejected');eq((await finish(s)).status,409,'incomplete finalize rejected');
 let status=await (await call(url+'/'+s.id,'GET',undefined,a)).json();eq(status.chunks.length,1,'interrupted session retains one chunk');
 eq((await call(url+'/'+s.id,'GET',undefined,b)).status,404,'other doctor status denied');
 for(let i=1;i<s.totalChunks;i++)eq((await put(s,i,stl.subarray(i*s.chunkSize,Math.min(stl.length,(i+1)*s.chunkSize)))).status,200,'resume missing chunk '+i);
 let r=await finish(s);eq(r.status,200,'finalize resumed STL');const file=(await r.json()).file;eq(file.sha256,sha(stl),'assembled SHA256 matches original');
 r=await finish(s);eq(r.status,200,'finalize retry succeeds');eq((await r.json()).file.id,file.id,'finalize retry creates no duplicate');
 eq((await call(url+'/files/'+file.id)).status,401,'anonymous download denied');eq((await call(url+'/files/'+file.id,'GET',undefined,b)).status,404,'other doctor download denied');
 r=await call(url+'/files/'+file.id,'GET',undefined,a);eq(r.status,200,'owner download succeeds');eq(sha(Buffer.from(await r.arrayBuffer())),sha(stl),'download exact bytes');eq(r.headers.get('cache-control'),'private, no-store','download never cached');assert(r.headers.get('content-disposition').startsWith('attachment;'));checks++;
 const fixtures=[['synthetic.pdf',Buffer.from('%PDF-1.7\nSynthetic fixture\n%%EOF')],['synthetic.ply',Buffer.from('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n')],['synthetic.dcm',Buffer.concat([Buffer.alloc(128),Buffer.from('DICM'),Buffer.alloc(32)])],['synthetic.jpg',Buffer.from([255,216,255,224,0,2,255,217])],['synthetic.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==','base64')],['ascii.stl',Buffer.from('solid scan\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid scan')]];
 for(const [name,bytes] of fixtures){const v=await init(name,bytes);eq((await put(v,0,bytes)).status,200,'upload '+name);const done=await finish(v);eq(done.status,200,'format accepted '+name);}
 const pdf=fixtures[0][1],v2=await init('synthetic.pdf',pdf);await put(v2,0,pdf);r=await finish(v2);eq((await r.json()).file.version,2,'same-name version increments');
 const wrong=await init('spoof.pdf',Buffer.from('<script>not pdf</script>'));await put(wrong,0,Buffer.from('<script>not pdf</script>'));eq((await finish(wrong)).status,400,'disguised file rejected');eq((await call(url+'/'+wrong.id,'DELETE',undefined,a)).status,200,'cancel rejected upload');
 const mismatch=await init('hash.pdf',pdf,'0'.repeat(64));await put(mismatch,0,pdf);eq((await finish(mismatch)).status,400,'whole-file checksum mismatch rejected');await call(url+'/'+mismatch.id,'DELETE',undefined,a);
 const cancelled=await init('cancel.pdf',pdf);await put(cancelled,0,pdf);eq((await call(url+'/'+cancelled.id,'DELETE',undefined,b)).status,404,'other doctor cancel denied');eq((await call(url+'/'+cancelled.id,'DELETE',undefined,a)).status,200,'cancel succeeds');eq((await put(cancelled,0,pdf)).status,409,'cancelled upload cannot resume');
 const expired=await init('expired.pdf',pdf);await db.query('UPDATE "LargeUploadSession" SET "expiresAt"=NOW()-interval \'1 minute\' WHERE id=$1',[expired.id]);eq((await put(expired,0,pdf)).status,410,'expired upload denied');await call(url+'/'+expired.id,'DELETE',undefined,a);
 const listed=await (await call(url,'GET',undefined,a)).json();eq(listed.files.length,8,'listing includes all completed versions only');
 eq((await call('/doctor-dashboard/cases/'+caseId,'GET',undefined,a)).status,200,'case UI renders');
 
 const token=randomBytes(32).toString('hex');await db.query('INSERT INTO "LabAccess"("caseId","tokenHash",label,"expiresAt") VALUES($1,$2,$3,NOW()+interval \'1 hour\')',[caseId,sha(token),'Synthetic upload lab']);const lab='/api/lab/cases/'+caseId,auth={Authorization:'Bearer '+token};
 eq((await call(lab+'/large-files/'+file.id,'GET',undefined,'',auth)).status,404,'lab cannot download draft records');
 eq((await call('/api/portal/cases/'+caseId,'POST',{action:'submit'},a)).status,200,'case submits with large files only');
 eq((await call(lab+'/large-files/'+file.id)).status,401,'lab download requires bearer credentials');
 eq((await call(lab+'/large-files/'+file.id,'GET',undefined,'',{Authorization:'Bearer '+'0'.repeat(64)})).status,403,'wrong lab credential denied');
 const labList=await (await call(lab,'GET',undefined,'',auth)).json();eq(labList.largeFiles.length,8,'assigned lab sees large file metadata');
 const labDownload=await call(lab+'/large-files/'+file.id,'GET',undefined,'',auth);eq(labDownload.status,200,'assigned lab downloads submitted record');eq(sha(Buffer.from(await labDownload.arrayBuffer())),sha(stl),'lab download exact bytes');
 await db.query('UPDATE "LabAccess" SET "expiresAt"=NOW()-interval \'1 minute\' WHERE "caseId"=$1',[caseId]);eq((await call(lab+'/large-files/'+file.id,'GET',undefined,'',auth)).status,403,'expired lab credential denied');
 eq((await call(url,'POST',{name:'late.pdf',size:pdf.length},a)).status,409,'submitted case cannot initialize');
 await db.query('UPDATE "DoctorSession" SET "expiresAt"=NOW()-interval \'1 minute\' WHERE "doctorId"=$1',[doctors[0]]);eq((await call(url+'/files/'+file.id,'GET',undefined,a)).status,401,'expired login cannot download');
 console.log('Completed '+checks+' large upload checks.');
 }finally{for(const id of uploads){assert.match(id,/^[0-9a-f-]{36}$/i);const target=path.resolve('.private-clinical-uploads',id),storage=path.resolve('.private-clinical-uploads')+path.sep;if(!target.startsWith(storage))throw Error('Unsafe cleanup path');await fs.rm(target,{recursive:true,force:true});}await db.query('DELETE FROM "PortalCase" WHERE "doctorId"=ANY($1::text[])',[doctors]);await db.query('DELETE FROM "Doctor" WHERE id=ANY($1::text[])',[doctors]);await db.query('DELETE FROM "Clinic" WHERE id=$1',[clinic]);for(const email of emails)await db.query('DELETE FROM "LoginThrottle" WHERE key=$1',['login:'+sha(email)]);await db.end();console.log('Synthetic fixtures removed.');}}
main().catch(e=>{console.error(e);process.exitCode=1;});
