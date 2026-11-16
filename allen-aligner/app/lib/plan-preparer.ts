import 'server-only';
import { workActor } from './work-auth';
import { db, type Database } from './database';
import { PortalError } from './portal-http';

// The existing case grant authorizes access; the employee session identifies its preparer.
export async function planPreparer(request:Request,tx:Database=db) {
 const a=await workActor(request);
 if(!a.employeeId||a.mustChangePassword)throw new PortalError(403,'Sign in with your active internal employee account before submitting a plan version.');
 return revalidatePlanPreparer({id:a.id,employeeId:a.employeeId},tx);
}

export async function revalidatePlanPreparer(a:{id:string;employeeId:string},tx:Database) {
 const [row]=await tx.query(`SELECT w.id,e.id AS "employeeId",e."fullName" AS name FROM "WorkAccount" w JOIN "Employee" e ON e.id=w."employeeId" WHERE w.id=$1 AND w."employeeId"=$2 AND w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE' FOR SHARE OF w,e`,[a.id,a.employeeId]);
 if(!row)throw new PortalError(403,'An active internal preparer account is required.');
 return {id:String(row.id),employeeId:String(row.employeeId),name:String(row.name)};
}
