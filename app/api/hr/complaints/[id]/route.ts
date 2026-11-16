import { currentHR } from '@/app/lib/hr-auth';
import { updateComplaint } from '@/app/lib/complaint-management';
import { failure,jsonBody,PortalError } from '@/app/lib/portal-http';
import { sameOrigin } from '@/app/lib/portal-auth';

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){try{if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');const {id}=await context.params;return Response.json({message:'Complaint updated.',...(await updateComplaint(id,await jsonBody(request),await currentHR()))},{headers:{'Cache-Control':'no-store'}});}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='23503')return failure(new PortalError(400,'The related case or CAPA reference was not found.'));return failure(error);}}
