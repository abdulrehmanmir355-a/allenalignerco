import 'server-only';
import { z } from 'zod';
import { db, type Database } from './database';
import { scopeSQL, scopeArgs, workEmployee, type WorkActor } from './work-auth';
import { PortalError } from './portal-http';

export async function identityEvent(tx: Database, invitationId: string, actorId: string, action: string, detail: unknown = {}) {
 await tx.query('INSERT INTO "EmployeeIdentityEvent"("invitationId","actorId",action,detail) VALUES($1,$2,$3,$4)', [invitationId,actorId,action,JSON.stringify(detail)]);
}
export async function closeInvitations(tx: Database, employeeId: string, actorId: string, reason: string) {
 const rows=await tx.query(`UPDATE "EmployeeInvitation" SET status='CANCELLED',"closedAt"=now() WHERE "employeeId"=$1 AND "closedAt" IS NULL RETURNING id`,[employeeId]);
 for(const row of rows)await identityEvent(tx,String(row.id),actorId,'CANCELLED',{reason});
}
export async function identityData(a: WorkActor) {
 const employees=await db.query(`SELECT e.*,w."isActive" AS "accountActive",w."passwordHash" IS NOT NULL AS "hasCredentials",CASE WHEN $1 IN ('HR_ADMIN','HR_OFFICER') THEN w."registrationExpiresAt" ELSE NULL END AS "registrationExpiresAt",m."fullName" AS "managerName",h.email AS "createdByName" FROM "Employee" e JOIN "WorkAccount" w ON w."employeeId"=e.id LEFT JOIN "WorkAssignment" wa ON wa."employeeId"=e.id LEFT JOIN "WorkAccount" ma ON ma.id=wa."managerId" LEFT JOIN "Employee" m ON m.id=ma."employeeId" LEFT JOIN "HRUser" h ON h.id=e."createdBy" WHERE ${scopeSQL} ORDER BY e."fullName"`,scopeArgs(a));
 const ids=employees.map(e=>e.id);
 const invitations=['HR_ADMIN','HR_OFFICER'].includes(a.role)?await db.query(`SELECT i.*,h.email AS "issuedByName",d.email AS "deliveredByName" FROM "EmployeeInvitation" i JOIN "HRUser" h ON h.id=i."issuedBy" LEFT JOIN "HRUser" d ON d.id=i."deliveredBy" WHERE i."employeeId"=ANY($1::text[]) ORDER BY i."issuedAt" DESC`,[ids]):[];
 const events=['HR_ADMIN','HR_OFFICER'].includes(a.role)?await db.query(`SELECT v.* FROM "EmployeeIdentityEvent" v JOIN "EmployeeInvitation" i ON i.id=v."invitationId" WHERE i."employeeId"=ANY($1::text[]) ORDER BY v.id DESC`,[ids]):[];
 return {actor:a,employees,invitations,events};
}
const delivery=z.object({invitationId:z.uuid(),action:z.enum(['handover','receive','acknowledge']),receivedBy:z.string().trim().max(200).default(''),acknowledgementMethod:z.string().trim().max(100).default(''),remarks:z.string().trim().max(1000).default('')}).strict();
export async function identitySave(a:WorkActor,body:unknown) {
 if(!['HR_ADMIN','HR_OFFICER'].includes(a.role))throw new PortalError(403,'Authorized HR access is required to manage invitation delivery.');
 const p=delivery.safeParse(body);if(!p.success)throw new PortalError(400,'Check delivery details.');const b=p.data;
 return db.transaction(async tx=>{
  // Match invitation issuance lock order: account, then invitation.
  const [lookup]=await tx.query('SELECT "employeeId" FROM "EmployeeInvitation" WHERE id=$1',[b.invitationId]);
  if(!lookup)throw new PortalError(404,'Invitation not found.');
  await workEmployee(a,String(lookup.employeeId));
  await tx.query('SELECT id FROM "WorkAccount" WHERE "employeeId"=$1 FOR UPDATE',[lookup.employeeId]);
  const [i]=await tx.query('SELECT * FROM "EmployeeInvitation" WHERE id=$1 FOR UPDATE',[b.invitationId]);
  const self=b.action==='acknowledge';
  if(self ? a.employeeId!==i.employeeId : !['HR_ADMIN','HR_OFFICER'].includes(a.role))throw new PortalError(403,'Permission denied.');
  if(i.status==='CANCELLED'||i.status==='RECEIVED')throw new PortalError(409,'Invitation is cancelled or already acknowledged.');
  if(b.action==='handover'&&(i.status!=='ISSUED'||new Date(i.expiresAt)<=new Date()))throw new PortalError(409,'Only an issued, unexpired invitation can be handed over.');
  if(!self&&b.action==='receive'&&(!b.receivedBy||!b.acknowledgementMethod))throw new PortalError(400,'Enter receiver and acknowledgement method.');
  if(b.action==='handover')await tx.query(`UPDATE "EmployeeInvitation" SET status='HANDED_OVER',"deliveredBy"=$2,"deliveredAt"=now(),remarks=$3 WHERE id=$1`,[i.id,a.id,b.remarks]);
  else await tx.query(`UPDATE "EmployeeInvitation" SET status='RECEIVED',"receivedBy"=$2,"receivedAt"=now(),"acknowledgementMethod"=$3,remarks=$4 WHERE id=$1`,[i.id,self?a.employeeId:b.receivedBy,self?'Authenticated employee':b.acknowledgementMethod,b.remarks]);
  await identityEvent(tx,String(i.id),a.id,b.action,{receivedBy:self?a.employeeId:b.receivedBy,acknowledgementMethod:self?'Authenticated employee':b.acknowledgementMethod,remarks:b.remarks});
  return {message:'Delivery record updated.'};
 });
}
