import {currentHR} from '@/app/lib/hr-auth';
import {manageProductionAccess} from '@/app/lib/production-management';
import {failure,jsonBody,PortalError} from '@/app/lib/portal-http';
import {sameOrigin} from '@/app/lib/portal-auth';

export async function POST(request:Request){
 try{
  if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');
  return Response.json({message:'Production access updated.',...await manageProductionAccess(await jsonBody(request),await currentHR())},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
