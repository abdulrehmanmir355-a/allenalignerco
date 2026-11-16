import { currentAuditActor } from '@/app/lib/audit-team-auth';
import { updateAuditFinding } from '@/app/lib/audit-management';
import { failure,jsonBody,PortalError } from '@/app/lib/portal-http';
import { sameOrigin } from '@/app/lib/portal-auth';

export async function PATCH(request:Request,context:{params:Promise<{id:string;findingId:string}>}){try{if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');const {id,findingId}=await context.params;return Response.json({message:'Finding action saved.',...(await updateAuditFinding(id,findingId,await jsonBody(request),await currentAuditActor()))},{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
