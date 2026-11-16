import 'server-only';
import { cookies } from 'next/headers';
import { db } from './database';
import { currentHR } from './hr-auth';
import { digest, sameOrigin } from './portal-auth';
import { PortalError } from './portal-http';
export type WorkActor={id:string;role:string;employeeId:string|null;mustChangePassword:boolean};
async function sessionActor(request?:Request):Promise<WorkActor|null>{
 if(request&&request.method!=='GET'&&!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');
 const token=(await cookies()).get('allen_work_session')?.value;
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const [a]=await db.query(`SELECT a.id,a.role,a."employeeId",a."mustChangePassword" FROM "WorkSession" s JOIN "WorkAccount" a ON a.id=s."accountId" JOIN "ClinicalIdentity" e ON e."accountId"=a.id WHERE s."tokenHash"=$1 AND s."expiresAt">now() AND a."isActive" AND e.status='ACTIVE'`,[digest(token)]);
 return a?a as WorkActor:null;
}
// Employee Portal and clinical permissions come only from the work session.
// An HR session must not be treated as an employee identity.
export async function workSessionActor(request?:Request):Promise<WorkActor>{
 const actor=await sessionActor(request);
 if(!actor)throw new PortalError(401,'Sign in through the Employee Portal.');
 return actor;
}
export async function workActor(request?:Request):Promise<WorkActor>{
 const actor=await sessionActor(request);
 if(actor)return actor;
 const hr=await currentHR();if(hr&&['HR_ADMIN','HR_OFFICER'].includes(String(hr.role)))return {id:String(hr.id),role:String(hr.role),employeeId:null,mustChangePassword:false};
 throw new PortalError(401,'Sign in to an active Allen account.');
}
export function admin(a:WorkActor){if(a.role!=='HR_ADMIN')throw new PortalError(403,'HR administrator required.');}
// This scope controls employee record lookups and write authorization.
export const scopeSQL=`($1='HR_ADMIN' OR e.id=$2 OR ($1='HR_OFFICER' AND EXISTS(SELECT 1 FROM "WorkHRGrant" g WHERE g."employeeId"=e.id AND g."userId"=$3::uuid)))`;
// HR can read the organization work queues; employee and manager accounts are
// always scoped to their own Employee ID. Manager accounts remain private employee accounts.
export const workReadScopeSQL=`($1 IN ('HR_ADMIN','HR_OFFICER') OR e.id=$2)`;
export const scopeArgs=(a:WorkActor)=>[a.role,a.employeeId,a.id];
export async function workEmployee(a:WorkActor,id:string,evaluate=false){
 const [e]=await db.query(`SELECT e.* FROM "Employee" e WHERE ${scopeSQL} AND e.id=$4`,[...scopeArgs(a),id]);
 if(!e)throw new PortalError(404,'Employee not found.');
 if(evaluate){
  if(a.employeeId===id||a.role==='EMPLOYEE')throw new PortalError(403,'Self-review is not permitted.');
  if(a.role==='HR_OFFICER'&&!(await db.query('SELECT 1 FROM "WorkHRGrant" WHERE "userId"=$1 AND "employeeId"=$2 AND "canEvaluate"',[a.id,id])).length)throw new PortalError(403,'Evaluation permission required.');
 }
 return e;
}
