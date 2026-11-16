import { currentAuditActor } from '@/app/lib/audit-team-auth';
import { auditList,createAuditPlan } from '@/app/lib/audit-management';
import { failure,jsonBody,PortalError } from '@/app/lib/portal-http';
import { sameOrigin } from '@/app/lib/portal-auth';

export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await auditList(await currentAuditActor()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
export async function POST(request:Request){try{if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');return Response.json({message:'Internal audit planned.',...(await createAuditPlan(await jsonBody(request),await currentAuditActor()))},{status:201,headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
