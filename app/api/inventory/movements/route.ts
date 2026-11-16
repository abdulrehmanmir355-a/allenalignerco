import {currentHR} from '@/app/lib/hr-auth';
import {recordInventoryMovement} from '@/app/lib/inventory-management';
import {sameOrigin} from '@/app/lib/portal-auth';
import {failure,jsonBody,PortalError} from '@/app/lib/portal-http';
export async function POST(request:Request){try{if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');return Response.json({message:'Stock movement recorded.',...await recordInventoryMovement(await jsonBody(request),await currentHR())},{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
