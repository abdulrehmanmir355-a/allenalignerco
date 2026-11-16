import { currentAuditActor } from '@/app/lib/audit-team-auth';
import { createFindingCapa } from '@/app/lib/audit-management';
import { failure,PortalError } from '@/app/lib/portal-http';
import { sameOrigin } from '@/app/lib/portal-auth';

export async function POST(request:Request,context:{params:Promise<{id:string;findingId:string}>}){try{if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');const {id,findingId}=await context.params;return Response.json({message:'CAPA opened and linked to the audit finding.',...(await createFindingCapa(id,findingId,await currentAuditActor()))},{status:201,headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
