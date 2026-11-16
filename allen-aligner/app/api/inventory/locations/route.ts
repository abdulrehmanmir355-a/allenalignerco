import {currentHR} from '@/app/lib/hr-auth';
import {createInventoryLocation} from '@/app/lib/inventory-management';
import {sameOrigin} from '@/app/lib/portal-auth';
import {failure,jsonBody,PortalError} from '@/app/lib/portal-http';
export async function POST(request:Request){
 try{
  if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');
  return Response.json({message:'Inventory location created.',...await createInventoryLocation(await jsonBody(request),await currentHR())},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
