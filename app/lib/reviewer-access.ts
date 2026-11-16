import 'server-only';
import {randomBytes,randomUUID} from 'node:crypto';
import {hash,compare} from 'bcryptjs';
import {z} from 'zod';
import {db,type Database} from './database';
import {digest} from './portal-auth';
import {PortalError} from './portal-http';

const email=z.string().trim().toLowerCase().email().max(254);
const reason=z.string().trim().min(10).max(2000);
const manage=z.discriminatedUnion('action',[
 z.object({action:z.literal('invite'),email,name:z.string().trim().min(2).max(200),reason}).strict(),
 z.object({action:z.enum(['replace','revoke','suspend','approve','reject']),accountId:z.string().uuid(),reason}).strict(),
]);
const activate=z.object({email,code:z.string().trim().regex(/^[a-f0-9]{64}$/),password:z.string().min(12).max(72).refine(v=>Buffer.byteLength(v,'utf8')<=72),confirmPassword:z.string().max(72)}).strict();
const login=z.object({email,password:z.string().min(1).max(72)}).strict();
type HR={id:string;role:string;email:string};
function manager(a:HR|null):asserts a is HR{if(!a)throw new PortalError(401,'HR sign-in required.');if(!['HR_ADMIN','HR_OFFICER','HR_VIEWER'].includes(a.role))throw new PortalError(403,'An authorized HR account is required to manage reviewer access.');}
function canManage(a:HR){if(!['HR_ADMIN','HR_OFFICER'].includes(a.role))throw new PortalError(403,'HR Admin or HR Officer access is required to issue codes or decide reviewer approval.');}
async function audit(tx:Database,a:{id:string;email:string},action:string,accountId:string,detail:unknown){
 await tx.query(`INSERT INTO "ClinicalReviewAudit"("actorId","actorName",action,detail) VALUES($1,$2,$3,$4::jsonb)`,[a.id,a.email,action,JSON.stringify({accountId,...detail as object})]);
}
export async function reviewerAccessData(a:HR|null,database:Database=db){
 manager(a);
 const accounts=await database.query(`SELECT id,"reviewerName" AS name,"reviewerEmail" AS email,"isActive","clinicalRole","clinicalRequest"->>'status' AS "approvalStatus","registrationExpiresAt" AS "expiresAt",
 CASE WHEN "isActive" THEN 'ACTIVE' WHEN "passwordHash" IS NOT NULL THEN 'SUSPENDED' WHEN "registrationTokenHash" IS NULL THEN 'REVOKED' WHEN "registrationExpiresAt"<=clock_timestamp() THEN 'EXPIRED' ELSE 'INVITED' END AS state
 FROM "WorkAccount" WHERE role='CLINICAL_ONLY' ORDER BY "reviewerName" LIMIT 500`);
 const events=await database.query(`SELECT id,"actorName",action,detail,"createdAt" FROM "ClinicalReviewAudit" WHERE action LIKE 'REVIEWER_ACCESS_%' ORDER BY id DESC LIMIT 100`);
 return {actor:{role:a.role},accounts,events};
}
export async function manageReviewerAccess(body:unknown,a:HR|null,database:Database=db){
 manager(a);canManage(a);const parsed=manage.safeParse(body);if(!parsed.success)throw new PortalError(400,'Provide the reviewer identity, action and a reason of at least 10 characters.');const b=parsed.data;
 return database.transaction(async tx=>{
  let account;
  if(b.action==='invite'){
   await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,['reviewer-email:'+b.email]);
   if((await tx.query(`SELECT 1 FROM "WorkAccount" WHERE "reviewerEmail"=$1`,[b.email])).length)throw new PortalError(409,'A reviewer account already exists for this email. Use its invitation or suspension controls.');
   [account]=await tx.query(`INSERT INTO "WorkAccount"(role,"reviewerEmail","reviewerName","mustChangePassword") VALUES('CLINICAL_ONLY',$1,$2,false) RETURNING id,"reviewerEmail" AS email`,[b.email,b.name]);
  }else{
   [account]=await tx.query(`SELECT id,"reviewerEmail" AS email,"isActive","mustChangePassword","clinicalRole","clinicalRequest","passwordHash" FROM "WorkAccount" WHERE id=$1 AND role='CLINICAL_ONLY' FOR UPDATE`,[b.accountId]);
   if(!account)throw new PortalError(404,'Reviewer account not found.');
   if(b.action==='approve'||b.action==='reject'){
    const pending=account.clinicalRequest;
    if(!account.isActive||account.mustChangePassword||!pending||pending.status!=='PENDING'||pending.role!=='REVIEWER'||account.clinicalRole)throw new PortalError(409,'The reviewer must activate their account and have a pending Reviewer access request.');
    if(String(account.email).toLowerCase()===a.email.trim().toLowerCase()||account.id===a.id)throw new PortalError(403,'Another HR approver must verify your reviewer qualifications.');
    if(!(await tx.query(`SELECT 1 FROM "ClinicalIdentity" WHERE "accountId"=$1 AND status='ACTIVE'`,[account.id])).length)throw new PortalError(409,'Reviewer identity requires verification.');
    const decision={...pending,status:b.action==='approve'?'APPROVED':'REJECTED',decidedBy:a.id,decidedByRole:a.role,decidedAt:new Date().toISOString(),decisionReason:b.reason};
    await tx.query(`UPDATE "WorkAccount" SET "clinicalRole"=$2,"clinicalRequest"=$3::jsonb WHERE id=$1`,[account.id,b.action==='approve'?'REVIEWER':null,JSON.stringify(decision)]);
    await audit(tx,a,'REVIEWER_ACCESS_'+decision.status,String(account.id),{reason:b.reason,before:pending,after:decision});
    return {message:b.action==='approve'?'Reviewer approved by HR. They can now sign in and review assigned cases.':'Reviewer access rejected by HR.'};
   }
   if(b.action==='revoke'){
    if(account.passwordHash)throw new PortalError(409,'This account is already activated. Suspend account access instead.');
    await tx.query(`UPDATE "WorkAccount" SET "registrationTokenHash"=NULL,"registrationExpiresAt"=NULL WHERE id=$1`,[account.id]);
   }else if(b.action==='suspend'){
    await tx.query(`UPDATE "WorkAccount" SET "isActive"=false,"clinicalRole"=NULL,"clinicalRequest"=NULL,"registrationTokenHash"=NULL,"registrationExpiresAt"=NULL WHERE id=$1`,[account.id]);
    await tx.query(`DELETE FROM "WorkSession" WHERE "accountId"=$1`,[account.id]);
   }else if(account.passwordHash||account.isActive)throw new PortalError(409,'Replacement codes are for unactivated accounts only.');
   if(b.action==='suspend'||b.action==='revoke'){
    await audit(tx,a,'REVIEWER_ACCESS_'+b.action.toUpperCase(),String(account.id),{reason:b.reason});return {message:b.action==='suspend'?'Reviewer access suspended; sessions revoked.':'Invitation revoked.'};
   }
  }
  const code=randomBytes(32).toString('hex');
  const [issued]=await tx.query(`UPDATE "WorkAccount" SET "registrationTokenHash"=$2,"registrationExpiresAt"=clock_timestamp()+interval '24 hours',"clinicalRequest"=$3::jsonb WHERE id=$1 RETURNING "registrationExpiresAt" AS "expiresAt"`,[account.id,digest(code),JSON.stringify({id:randomUUID(),role:'REVIEWER',status:'INVITED',reason:b.reason,issuedBy:a.id})]);
  await audit(tx,a,'REVIEWER_ACCESS_'+(b.action==='invite'?'ISSUED':'REPLACED'),String(account.id),{reason:b.reason,email:account.email,expiresAt:issued.expiresAt});
  return {message:'One-time invitation created. Share this code privately with the named reviewer. HR reviewer approval follows activation.',email:account.email,code,expiresAt:issued.expiresAt};
 });
}
export async function activateReviewer(body:unknown,database:Database=db){
 const parsed=activate.safeParse(body);if(!parsed.success)throw new PortalError(400,'Check your email, code and password (12–72 characters, at most 72 UTF-8 bytes).');const b=parsed.data;
 if(b.password!==b.confirmPassword)throw new PortalError(400,'Passwords do not match.');
 return database.transaction(async tx=>{
  const [a]=await tx.query(`SELECT * FROM "WorkAccount" WHERE "reviewerEmail"=$1 AND role='CLINICAL_ONLY' FOR UPDATE`,[b.email]);
  const invalid=()=>new PortalError(400,'Code is invalid, expired or already used. Contact HR.');
  if(!a||a.isActive||a.passwordHash||a.registrationTokenHash!==digest(b.code)||!a.registrationExpiresAt||new Date(a.registrationExpiresAt)<=new Date())throw invalid();
  const passwordHash=await hash(b.password,12);
  const request={id:randomUUID(),role:'REVIEWER',reason:a.clinicalRequest?.reason||'HR invited reviewer',issuedBy:a.clinicalRequest?.issuedBy,status:'PENDING',requestedAt:new Date().toISOString()};
  const activated=await tx.query(`UPDATE "WorkAccount" SET "passwordHash"=$2,"isActive"=true,"mustChangePassword"=false,"registrationTokenHash"=NULL,"registrationExpiresAt"=NULL,"clinicalRequest"=$3::jsonb WHERE id=$1 AND "registrationExpiresAt">clock_timestamp() RETURNING id`,[a.id,passwordHash,JSON.stringify(request)]);
  if(!activated.length)throw invalid();
  await audit(tx,{id:String(a.id),email:b.email},'REVIEWER_ACCESS_ACTIVATED',String(a.id),{});
  return {message:'Account activated. Sign in with your email and Allen password. Reviewer access awaits HR qualification approval.'};
 });
}
export async function reviewerCredentials(body:unknown,database:Database=db){
 const p=login.safeParse(body);if(!p.success)throw new PortalError(400,'Enter your email and Allen account password.');const b=p.data;
 const rows=await database.query(`SELECT w.id,w."passwordHash",w."employeeId",w."clinicalRole" FROM "WorkAccount" w
   LEFT JOIN "Employee" e ON e.id=w."employeeId"
   WHERE w."isActive" AND NOT w."mustChangePassword" AND
    ((w.role='CLINICAL_ONLY' AND w."reviewerEmail"=$1) OR (w.role<>'CLINICAL_ONLY' AND lower(trim(e.email))=$1))
   LIMIT 20`,[b.email]);
 const fallback='$2b$12$Jzi.AT7McnvHeZFI9cm8XOB6FX9Z9tW3xz2q2A/jU1B/bQEc5zE4a';
 const matches=await Promise.all(rows.map(async row=>({row,valid:await compare(b.password,String(row.passwordHash||fallback))})));
 const accepted=matches.filter(match=>match.valid);
 if(accepted.length!==1)throw new PortalError(401,'Invalid email or password, or account unavailable.');
 const a=accepted[0].row;
 return {id:String(a.id),passwordHash:String(a.passwordHash)};
}
