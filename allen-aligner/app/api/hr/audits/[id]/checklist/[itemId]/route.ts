import { currentAuditActor } from '@/app/lib/audit-team-auth';
import { answerChecklistItem } from '@/app/lib/audit-management';
import { failure,jsonBody,PortalError } from '@/app/lib/portal-http';
import { sameOrigin } from '@/app/lib/portal-auth';

export async function PATCH(request:Request,context:{params:Promise<{id:string;itemId:string}>}){try{if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');const {id,itemId}=await context.params;return Response.json({message:'Checklist response saved.',...(await answerChecklistItem(id,itemId,await jsonBody(request),await currentAuditActor()))},{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
