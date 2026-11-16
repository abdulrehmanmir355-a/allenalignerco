import 'server-only';
import { db } from './database';
import { PortalError } from './portal-http';
export type HRIdentity={id:unknown;role:unknown};
export function hrScope(user:HRIdentity){
 if(!user.id||!['HR_ADMIN','HR_OFFICER','HR_VIEWER'].includes(String(user.role)))throw new PortalError(403,'HR permission required.');
 // The CTE also scopes legacy HR screens, including child offboarding records.
 return {sql:`WITH "Employee" AS (SELECT * FROM public."Employee" e WHERE $1='HR_ADMIN' OR EXISTS(SELECT 1 FROM "WorkHRGrant" g WHERE g."employeeId"=e.id AND g."userId"=$2::uuid)), "EmployeeOffboarding" AS (SELECT o.* FROM public."EmployeeOffboarding" o JOIN "Employee" e ON e.id=o."employeeId"), "OffboardingClearance" AS (SELECT c.* FROM public."OffboardingClearance" c JOIN "EmployeeOffboarding" o ON o.id=c."offboardingId"), "OffboardingAsset" AS (SELECT c.* FROM public."OffboardingAsset" c JOIN "EmployeeOffboarding" o ON o.id=c."offboardingId"), "OffboardingSettlement" AS (SELECT c.* FROM public."OffboardingSettlement" c JOIN "EmployeeOffboarding" o ON o.id=c."offboardingId") `,args:[String(user.role),String(user.id)]};
}
export async function hrEmployeeAllowed(user:HRIdentity,employeeId:string){if(!user.id||!['HR_ADMIN','HR_OFFICER','HR_VIEWER'].includes(String(user.role)))return false;return user.role==='HR_ADMIN'||(await db.query('SELECT 1 FROM "WorkHRGrant" WHERE "userId"=$1 AND "employeeId"=$2',[user.id,employeeId])).length>0;}
export async function hrRequireEmployee(user:HRIdentity,employeeId:string){if(!await hrEmployeeAllowed(user,employeeId))throw new PortalError(404,'Employee not found.');}
