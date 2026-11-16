import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { db, type Database } from './database';
import { currentHR } from './hr-auth';
import { currentOwner } from './owner-auth';
import { currentDoctor, digest, sameOrigin } from './portal-auth';
import { currentClinic } from './clinic-auth';
import { PortalError } from './portal-http';
import { serviceCategories, serviceStates, transitionAllowed, priorityFrom, dueAt, type ServiceActor, type ServiceState } from './customer-service-policy';

type Row = Record<string, any>; // Raw PostgreSQL rows; responses below use explicit projections.
const uuid = z.string().uuid();
const reason = z.string().trim().min(3).max(2000);
function fail(status: number, message: string): never { throw new PortalError(status,message); }
function valid<T>(schema: z.ZodType<T>, data: unknown): T { const p=schema.safeParse(data); if(!p.success) return fail(422,p.error.issues[0]?.message || 'Invalid request.'); return p.data; }
export async function serviceActor(request?: Request): Promise<ServiceActor|null> {
 if(request && request.method!=='GET' && !sameOrigin(request)) fail(403,'Invalid request origin.');
 const hr=await currentHR();
 if(hr){
  const bootstrap=hr.role==='HR_ADMIN' && !!process.env.AA_OWNER_ACCOUNT_ID && hr.id.toLowerCase()===process.env.AA_OWNER_ACCOUNT_ID.toLowerCase();
  if(bootstrap) return {id:hr.id,kind:'HR',name:hr.email,role:'SUPERVISOR',clinicId:null,bootstrap:true};
  const [g]=await db.query('SELECT role FROM allen_service_staff WHERE account_kind=$1 AND account_id=$2 AND active',['HR',hr.id]);
  if(g)return {id:hr.id,kind:'HR',name:hr.email,role:g.role,clinicId:null,bootstrap:false};
 }
 const owner=await currentOwner().catch(()=>null);
 if(owner) return {id:owner.id,kind:'OWNER',name:owner.email,role:'SUPERVISOR',clinicId:null,bootstrap:true};
 const token=(await cookies()).get('allen_work_session')?.value;
 if(token && /^[a-f0-9]{64}$/.test(token)){
  const [w]=await db.query(`SELECT a.id,e."fullName" AS name,g.role FROM "WorkSession" s JOIN "WorkAccount" a ON a.id=s."accountId" JOIN "Employee" e ON e.id=a."employeeId" JOIN allen_service_staff g ON g.account_kind='WORK' AND g.account_id=a.id::text AND g.active WHERE s."tokenHash"=$1 AND s."expiresAt">now() AND a."isActive" AND NOT a."mustChangePassword" AND e.status='ACTIVE'`,[digest(token)]);
  if(w)return {id:w.id,kind:'WORK',name:w.name,role:w.role,clinicId:null,bootstrap:false};
 }
 const doctor=await currentDoctor();
 if(doctor)return {id:doctor.id,kind:'DOCTOR',name:doctor.fullName,role:'REQUESTER',clinicId:doctor.clinicId,bootstrap:false};
 const clinic=await currentClinic();
 if(clinic)return {id:clinic.id,kind:'CLINIC',name:clinic.fullName,role:'REQUESTER',clinicId:clinic.clinicId,bootstrap:false};
 return null;
}
export async function requireServiceActor(request: Request) { const a=await serviceActor(request); return a || fail(401,'Sign in with a doctor, clinic or authorized customer service account.'); }
function scope(a:ServiceActor,alias='t') { return {sql:a.role==='SUPERVISOR'?'TRUE':a.role==='AGENT'?`${alias}.owner_id=$1 AND ${alias}.owner_kind=$2`:`${alias}.requester_id=$1 AND ${alias}.requester_kind=$2 AND ${alias}.clinic_id=$3`,args:a.role==='SUPERVISOR'?[]:a.role==='AGENT'?[a.id,a.kind]:[a.id,a.kind,a.clinicId]}; }
async function ticket(a:ServiceActor,id:string,tx:Database=db,lock=false):Promise<Row>{
 valid(uuid,id);const s=scope(a);const [t]=await tx.query(`SELECT t.* FROM allen_service_ticket t WHERE (${s.sql}) AND t.id=$${s.args.length+1} ${lock?'FOR UPDATE OF t':''}`,[...s.args,id]);return t || fail(404,'Request not found.');
}
function supervisor(a:ServiceActor){if(a.role!=='SUPERVISOR')fail(403,'Customer service supervisor access required.');}
async function audit(tx:Database,a:ServiceActor,id:string|null,action:string,why:string,before:unknown=null,after:unknown=null){await tx.query('INSERT INTO allen_service_audit(ticket_id,actor_id,actor_kind,action,reason,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,a.id,a.kind,action,why,before===null?null:JSON.stringify(before),after===null?null:JSON.stringify(after)]);}
async function startTargets(tx:Database,id:string,cycle:number,priority:string,start:Date,includeResponse:boolean){
 const [p]=await tx.query('SELECT * FROM allen_service_policy WHERE priority=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[priority]);
 if(!p)return;
 for(const [metric,minutes] of [['RESPONSE',p.response_minutes],['RESOLUTION',p.resolution_minutes]] as const){if(metric==='RESPONSE'&&!includeResponse)continue;await tx.query('INSERT INTO allen_service_sla(id,ticket_id,cycle,metric,policy_id,started_at,due_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(ticket_id,cycle,metric) DO NOTHING',[randomUUID(),id,cycle,metric,p.id,start,dueAt(start,minutes)]);}
}
async function caseEvent(tx:Database,t:Row,label:string){if(t.case_id)await tx.query('INSERT INTO "CaseEvent"(id,"caseId",label) VALUES($1,$2,$3)',[randomUUID(),t.case_id,`Support AA-CS-${t.number}: ${label}`]);}
function publicTicket(t:Row,a:ServiceActor){return {id:t.id,number:t.number,subject:t.subject,description:t.description,category:t.category,priority:t.priority,state:t.state,team:t.team,case_id:t.case_id,created_at:t.created_at,updated_at:t.updated_at,cycle:t.cycle,version:t.version,resolution:t.resolution,...(a.role!=='REQUESTER'?{requester_name:t.requester_name,clinic_id:t.clinic_id,owner_id:t.owner_id,owner_kind:t.owner_kind,impact:t.impact,urgency:t.urgency,quality_flag:t.quality_flag,quality_assessment:t.quality_assessment,owner_name:t.owner_name}: {})};}
export async function listService(a:ServiceActor,url:URL){
 const s=scope(a),args:unknown[]=[...s.args],where=[`(${s.sql})`];
 const q=(url.searchParams.get('q')||'').trim().slice(0,100),state=url.searchParams.get('state')||'';
 if(q){args.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');where.push(`(t.subject ILIKE $${args.length} OR ('AA-CS-'||t.number::text) ILIKE $${args.length})`);}
 if(serviceStates.includes(state as ServiceState)){args.push(state);where.push(`t.state=$${args.length}`);}
 const raw=Number(url.searchParams.get('page')||1),page=Number.isSafeInteger(raw)&&raw>0?Math.min(raw,100000):1;
 const [count]=await db.query(`SELECT count(*)::int AS total FROM allen_service_ticket t WHERE ${where.join(' AND ')}`,args);
 const rows=await db.query(`SELECT t.*,COALESCE(h.email,e."fullName") AS owner_name FROM allen_service_ticket t LEFT JOIN "HRUser" h ON t.owner_kind='HR' AND t.owner_id=h.id::text LEFT JOIN "WorkAccount" w ON t.owner_kind='WORK' AND t.owner_id=w.id::text LEFT JOIN "Employee" e ON e.id=w."employeeId" WHERE ${where.join(' AND ')} ORDER BY CASE WHEN t.state IN ('RESOLVED','CLOSED','CANCELLED') THEN 1 ELSE 0 END,t.priority,t.updated_at DESC,t.id LIMIT 30 OFFSET $${args.length+1}`,[...args,(page-1)*30]);
 const [stats]=await db.query(`SELECT count(*) FILTER(WHERE state NOT IN ('RESOLVED','CLOSED','CANCELLED'))::int AS open,count(*) FILTER(WHERE owner_id IS NULL AND state NOT IN ('CLOSED','CANCELLED'))::int AS unassigned,count(*) FILTER(WHERE state='RESOLVED')::int AS resolved,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM allen_service_escalation e WHERE e.ticket_id=t.id AND e.acknowledged_at IS NULL))::int AS escalated FROM allen_service_ticket t WHERE (${s.sql})`,s.args);
 return {tickets:rows.map(t=>publicTicket(t,a)),actor:a,total:count.total,page,stats};
}
export async function serviceDetail(a:ServiceActor,id:string){
 const t=await ticket(a,id);
 const messages=await db.query(`SELECT id,author_name,audience,body,created_at FROM allen_service_message WHERE ticket_id=$1 ${a.role==='REQUESTER'?"AND audience='PUBLIC'":''} ORDER BY created_at,id`,[id]);
 const slas=await db.query('SELECT id,cycle,metric,started_at,due_at,completed_at,breached_at,outcome FROM allen_service_sla WHERE ticket_id=$1 ORDER BY cycle,metric',[id]);
 const escalations=a.role==='REQUESTER'?[]:await db.query('SELECT id,reason,created_at,acknowledged_at FROM allen_service_escalation WHERE ticket_id=$1 ORDER BY created_at',[id]);
 const history=a.role==='REQUESTER'?[]:await db.query('SELECT id,action,reason,actor_kind,created_at FROM allen_service_audit WHERE ticket_id=$1 ORDER BY id DESC LIMIT 100',[id]);
 return {ticket:publicTicket(t,a),messages,slas,escalations,history};
}
export async function serviceMeta(a:ServiceActor){
 let cases:Row[]=[];
 if(a.kind==='DOCTOR')cases=await db.query('SELECT id,"patientReference" AS label FROM "PortalCase" WHERE "doctorId"=$1 AND "clinicId"=$2 ORDER BY "updatedAt" DESC LIMIT 200',[a.id,a.clinicId]);
 // Clinic staff can submit account/general requests; doctor-private cases are never selectable here.
 const staff=a.role==='SUPERVISOR'?await staffAccounts():[];
 const policies=a.role==='SUPERVISOR'?await db.query('SELECT DISTINCT ON(priority) priority,response_minutes,resolution_minutes,created_at FROM allen_service_policy ORDER BY priority,created_at DESC,id DESC'):[];
 return {actor:a,categories:serviceCategories,cases,staff,policies};
}
async function staffAccounts(){return db.query(`SELECT 'HR' AS kind,h.id::text AS id,h.email AS name,g.role,COALESCE(g.active,false) AS active FROM "HRUser" h LEFT JOIN allen_service_staff g ON g.account_kind='HR' AND g.account_id=h.id::text WHERE h."isActive" UNION ALL SELECT 'WORK',w.id::text,e."fullName",g.role,COALESCE(g.active,false) FROM "WorkAccount" w JOIN "Employee" e ON e.id=w."employeeId" LEFT JOIN allen_service_staff g ON g.account_kind='WORK' AND g.account_id=w.id::text WHERE w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE' ORDER BY name`);}
export async function createService(a:ServiceActor,data:unknown,key:unknown){
 const b=valid(z.object({subject:z.string().trim().min(3).max(180),description:z.string().trim().min(5).max(10000),category:z.enum(serviceCategories),impact:z.enum(['HIGH','MEDIUM','LOW']),urgency:z.enum(['IMMEDIATE','TIME_SENSITIVE','ROUTINE']),caseId:z.string().max(100).optional()}),data);
 const intake=valid(uuid,key),hash=createHash('sha256').update(JSON.stringify(b)).digest('hex');
 return db.transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[a.kind+':'+a.id+':'+intake]);
  const [old]=await tx.query('SELECT ticket_id,payload_hash FROM allen_service_intake WHERE actor_id=$1 AND actor_kind=$2 AND intake_key=$3',[a.id,a.kind,intake]);
  if(old){if(old.payload_hash!==hash)fail(409,'This request key was already used with different details.');await ticket(a,old.ticket_id,tx);return {id:old.ticket_id};}
  if(b.caseId){if(a.kind!=='DOCTOR')fail(403,'Only the assigned doctor can link a case when creating a request.');const [c]=await tx.query('SELECT id FROM "PortalCase" WHERE id=$1 AND "doctorId"=$2 AND "clinicId"=$3',[b.caseId,a.id,a.clinicId]);if(!c)fail(404,'Case not found.');}
  const id=randomUUID(),p=priorityFrom(b.impact,b.urgency),quality=b.category==='Quality complaint',staff=a.role!=='REQUESTER';
  const [t]=await tx.query(`INSERT INTO allen_service_ticket(id,clinic_id,case_id,requester_id,requester_kind,requester_name,subject,description,category,impact,urgency,priority,owner_id,owner_kind,quality_flag) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[id,a.clinicId,b.caseId||null,a.id,a.kind,a.name,b.subject,b.description,b.category,b.impact,b.urgency,p,staff?a.id:null,staff?a.kind:null,quality]);
  await startTargets(tx,id,1,p,t.created_at,true);
  await audit(tx,a,id,'CREATED','Request accepted',null,{subject:b.subject,category:b.category,priority:p});
  if(quality)await tx.query("INSERT INTO allen_service_escalation(ticket_id,reason) VALUES($1,'Quality review required')",[id]);
  await caseEvent(tx,t,'Request created');
  await tx.query('INSERT INTO allen_service_intake(actor_id,actor_kind,intake_key,payload_hash,ticket_id) VALUES($1,$2,$3,$4,$5)',[a.id,a.kind,intake,hash,id]);
  return {id};
 });
}
export async function serviceAction(a:ServiceActor,data:unknown){
 const b=valid(z.object({id:uuid,version:z.number().int().positive(),action:z.enum(['message','assign','priority','transition','targets','quality','acknowledge']),body:z.string().trim().max(10000).optional(),audience:z.enum(['PUBLIC','INTERNAL']).optional(),ownerId:z.string().max(100).optional(),ownerKind:z.enum(['HR','WORK']).optional(),priority:z.enum(['P1','P2','P3','P4']).optional(),state:z.enum(serviceStates).optional(),reason:reason.optional(),escalationId:z.string().regex(/^\d+$/).optional()}),data);
 return db.transaction(async tx=>{
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('allen-service-clock',0))");
  await tx.query('SELECT aa_service_refresh()');
  const t=await ticket(a,b.id,tx,true);if(t.version!==b.version)fail(412,'This request changed. Refresh it before saving.');
  const why=b.reason||b.body||'';let next=t.state;
  if(b.action==='message'){
   if(['CLOSED','CANCELLED'].includes(t.state))fail(409,'This request is closed. Create a new request.');
   if(!b.body||b.body.length<1)fail(422,'Enter a message.');
   if(a.role==='REQUESTER'&&b.audience==='INTERNAL')fail(403,'Internal notes are restricted to customer service staff.');
   const audience=a.role==='REQUESTER'?'PUBLIC':b.audience;if(!audience)fail(422,'Choose public reply or internal note.');
   await tx.query('INSERT INTO allen_service_message(id,ticket_id,author_id,author_kind,author_name,audience,body) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),b.id,a.id,a.kind,a.role==='REQUESTER'?a.name:'Allen Customer Service',audience,b.body]);
   if(a.role!=='REQUESTER'&&audience==='PUBLIC')await tx.query("UPDATE allen_service_sla SET completed_at=now(),outcome='SUCCESS' WHERE ticket_id=$1 AND metric='RESPONSE' AND completed_at IS NULL AND outcome IS NULL",[b.id]);
   if(a.role==='REQUESTER'&&t.state==='WAITING_CUSTOMER')next='IN_PROGRESS';
   await audit(tx,a,b.id,audience==='PUBLIC'?'PUBLIC_REPLY':'INTERNAL_NOTE','Message saved');
  }else if(b.action==='assign'){
   supervisor(a);if(!b.ownerId||!b.ownerKind||!b.reason)fail(422,'Select an owner and explain the handoff.');
   const ownerId=b.ownerId;const candidates=await staffAccounts();const candidate=candidates.find(s=>s.id===b.ownerId&&s.kind===b.ownerKind&&(s.active||(b.ownerKind==='HR'&&ownerId.toLowerCase()===(process.env.AA_OWNER_ACCOUNT_ID||'').toLowerCase())));
   if(!candidate)fail(422,'Select an active authorized service account.');
   await tx.query('UPDATE allen_service_ticket SET owner_id=$2,owner_kind=$3 WHERE id=$1',[b.id,b.ownerId,b.ownerKind]);
   await audit(tx,a,b.id,'OWNER_CHANGED',b.reason,{owner_id:t.owner_id,owner_kind:t.owner_kind},{owner_id:b.ownerId,owner_kind:b.ownerKind});
  }else if(b.action==='priority'){
   supervisor(a);if(!b.priority||!b.reason)fail(422,'Choose a priority and provide a reason.');
   await tx.query('UPDATE allen_service_ticket SET priority=$2 WHERE id=$1',[b.id,b.priority]);
   await audit(tx,a,b.id,'PRIORITY_CHANGED',b.reason,{priority:t.priority},{priority:b.priority,serviceTargets:'Existing deadlines retained'});
  }else if(b.action==='targets'){
   supervisor(a);if(!b.reason)fail(422,'Explain applying the service targets.');
   if(['RESOLVED','CLOSED','CANCELLED'].includes(t.state))fail(409,'Service targets apply to active requests.');
   const [existing]=await tx.query('SELECT id FROM allen_service_sla WHERE ticket_id=$1 AND cycle=$2',[b.id,t.cycle]);if(existing)fail(409,'This cycle already has pinned service targets.');
   const [p]=await tx.query('SELECT id FROM allen_service_policy WHERE priority=$1 LIMIT 1',[t.priority]);if(!p)fail(422,'Configure service targets for this priority first.');
   const [replied]=await tx.query("SELECT id FROM allen_service_message WHERE ticket_id=$1 AND audience='PUBLIC' AND author_kind IN ('HR','WORK') LIMIT 1",[b.id]);
   await startTargets(tx,b.id,t.cycle,t.priority,t.cycle_started_at,t.cycle===1&&!replied);
   await audit(tx,a,b.id,'TARGETS_APPLIED',b.reason,null,{calendar:'Elapsed time, 24 hours / 7 days',start:t.created_at});
  }else if(b.action==='quality'){
   supervisor(a);if(!b.reason)fail(422,'Record the quality handoff or assessment reference.');
   await tx.query('UPDATE allen_service_ticket SET quality_flag=true,quality_assessment=$2 WHERE id=$1',[b.id,b.reason]);
   await tx.query("INSERT INTO allen_service_escalation(ticket_id,reason) VALUES($1,'Quality review required') ON CONFLICT DO NOTHING",[b.id]);
   await audit(tx,a,b.id,'QUALITY_HANDOFF_RECORDED',b.reason);
  }else if(b.action==='acknowledge'){
   supervisor(a);if(!b.escalationId||!b.reason)fail(422,'Select an escalation and record the next action.');
   const changed=await tx.query('UPDATE allen_service_escalation SET acknowledged_by=$3,acknowledged_at=now() WHERE id=$1 AND ticket_id=$2 AND acknowledged_at IS NULL RETURNING id',[b.escalationId,b.id,a.id]);if(!changed.length)fail(409,'Escalation is already acknowledged.');
   await audit(tx,a,b.id,'ESCALATION_ACKNOWLEDGED',b.reason);
  }else{
   if(!b.state||!b.reason)fail(422,'Choose a status and explain the change.');
   if(!transitionAllowed(a,t.state,b.state))fail(409,'This status change is not allowed.');
   if(['IN_PROGRESS','WAITING_CUSTOMER','WAITING_INTERNAL','RESOLVED','CLOSED'].includes(b.state)&&!t.owner_id)fail(422,'Assign an owner first.');
   if(b.state==='RESOLVED'){
    if(t.quality_flag&&!t.quality_assessment)fail(409,'A supervisor must record the quality handoff or assessment reference before resolution.');
    await tx.query('UPDATE allen_service_ticket SET resolution=$2,resolved_at=now() WHERE id=$1',[b.id,b.reason]);
    await tx.query("INSERT INTO allen_service_message(id,ticket_id,author_id,author_kind,author_name,audience,body) VALUES($1,$2,$3,$4,'Allen Customer Service','PUBLIC',$5)",[randomUUID(),b.id,a.id,a.kind,'Resolution: '+b.reason]);
    await tx.query("UPDATE allen_service_sla SET completed_at=now(),outcome='SUCCESS' WHERE ticket_id=$1 AND completed_at IS NULL AND outcome IS NULL",[b.id]);
   }
   if(t.state==='RESOLVED'&&b.state==='IN_PROGRESS'){
    await tx.query('UPDATE allen_service_ticket SET cycle=cycle+1,cycle_started_at=now(),resolution=NULL,resolved_at=NULL WHERE id=$1',[b.id]);
    await startTargets(tx,b.id,t.cycle+1,t.priority,new Date(),false);
   }
   if(b.state==='CANCELLED')await tx.query("UPDATE allen_service_sla SET completed_at=now(),outcome='CANCELLED' WHERE ticket_id=$1 AND completed_at IS NULL AND outcome IS NULL",[b.id]);
   if(b.state==='WAITING_CUSTOMER')await tx.query("INSERT INTO allen_service_message(id,ticket_id,author_id,author_kind,author_name,audience,body) VALUES($1,$2,$3,$4,'Allen Customer Service','PUBLIC',$5)",[randomUUID(),b.id,a.id,a.kind,b.reason]);
   next=b.state;
   await audit(tx,a,b.id,'STATUS_CHANGED',b.reason,{state:t.state},{state:next});
   if(['RESOLVED','CLOSED'].includes(next)||(t.state==='RESOLVED'&&next==='IN_PROGRESS'))await caseEvent(tx,t,next==='IN_PROGRESS'?'Request reopened':next==='RESOLVED'?'Request resolved':'Request closed');
  }
  await tx.query('UPDATE allen_service_ticket SET state=$2,version=version+1,updated_at=now() WHERE id=$1',[b.id,next]);
  await tx.query('SELECT aa_service_refresh()');
  return {id:b.id};
 });
}
export async function serviceSettings(a:ServiceActor,data:unknown){
 supervisor(a);const b=valid(z.discriminatedUnion('action',[
 z.object({action:z.literal('policy'),priority:z.enum(['P1','P2','P3','P4']),responseMinutes:z.number().int().min(1).max(525600),resolutionMinutes:z.number().int().min(1).max(525600),reason}),
 z.object({action:z.literal('staff'),accountId:z.string().min(1).max(100),accountKind:z.enum(['HR','WORK']),role:z.enum(['AGENT','SUPERVISOR']),active:z.boolean(),reason})]),data);
 return db.transaction(async tx=>{
  if(b.action==='policy'){
   await tx.query('INSERT INTO allen_service_policy(id,priority,response_minutes,resolution_minutes,activated_by) VALUES($1,$2,$3,$4,$5)',[randomUUID(),b.priority,b.responseMinutes,b.resolutionMinutes,a.id]);
   await audit(tx,a,null,'POLICY_ACTIVATED',b.reason,null,{priority:b.priority,responseMinutes:b.responseMinutes,resolutionMinutes:b.resolutionMinutes,calendar:'24/7 elapsed'});
  }else{
   if(!a.bootstrap)fail(403,'Only the Owner can grant or revoke customer service access.');
   const exists=(await staffAccounts()).some(s=>s.id===b.accountId&&s.kind===b.accountKind);if(!exists)fail(422,'Active account not found.');
   await tx.query('INSERT INTO allen_service_staff(account_kind,account_id,role,active,granted_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(account_kind,account_id) DO UPDATE SET role=EXCLUDED.role,active=EXCLUDED.active,granted_by=EXCLUDED.granted_by,updated_at=now()',[b.accountKind,b.accountId,b.role,b.active,a.id]);
   if(!b.active){
    const open=await tx.query("SELECT * FROM allen_service_ticket WHERE owner_id=$1 AND owner_kind=$2 AND state NOT IN ('CLOSED','CANCELLED') FOR UPDATE",[b.accountId,b.accountKind]);
    for(const t of open){await tx.query("UPDATE allen_service_ticket SET owner_id=$2,owner_kind=$3,version=version+1,updated_at=now() WHERE id=$1",[t.id,a.id,a.kind]);await audit(tx,a,t.id,'ACCESS_REVOKED_REASSIGNED',b.reason,{owner_id:b.accountId},{owner_id:a.id});}
   }
   await audit(tx,a,null,'STAFF_ACCESS_CHANGED',b.reason,null,b);
  }
  return {ok:true};
 });
}
