import { currentHR } from '@/app/lib/hr-auth';
import { complaintList,createComplaint } from '@/app/lib/complaint-management';
import { failure,jsonBody,PortalError } from '@/app/lib/portal-http';
import { sameOrigin } from '@/app/lib/portal-auth';

export async function GET(){try{return Response.json(await complaintList(await currentHR()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
export async function POST(request:Request){try{if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');return Response.json({message:'Complaint logged.',...(await createComplaint(await jsonBody(request),await currentHR()))},{status:201,headers:{'Cache-Control':'no-store'}});}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='23503')return failure(new PortalError(400,'The related case or CAPA reference was not found.'));return failure(error);}}
