import { currentAuditActor } from '@/app/lib/audit-team-auth';
import { transitionAudit } from '@/app/lib/audit-management';
import { failure,jsonBody,PortalError } from '@/app/lib/portal-http';
import { sameOrigin } from '@/app/lib/portal-auth';

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){try{if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');const {id}=await context.params;return Response.json({message:'Audit stage updated.',...(await transitionAudit(id,await jsonBody(request),await currentAuditActor()))},{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
