import {currentHR} from '@/app/lib/hr-auth';
import {productionDashboard} from '@/app/lib/production-management';
import {manufacturingOrderDashboard,manageManufacturingOrder,recordOperatorProductionStage} from '@/app/lib/manufacturing-orders';
import {workSessionActor} from '@/app/lib/work-auth';
import {failure,jsonBody,PortalError} from '@/app/lib/portal-http';
import {sameOrigin} from '@/app/lib/portal-auth';

export const dynamic='force-dynamic';
export async function GET(){
 try{const actor=await currentHR();const [production,manufacturing]=await Promise.all([productionDashboard(actor),manufacturingOrderDashboard(actor)]);return Response.json({...production,manufacturing},{headers:{'Cache-Control':'private, no-store'}});}
 catch(error){return failure(error);}
}
export async function POST(request:Request){
 try{if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');const body=await jsonBody(request);if(body&&typeof body==='object'&&'action'in body&&(body as {action?:unknown}).action==='record_operator_stage')return Response.json(await recordOperatorProductionStage(body,await workSessionActor(request)),{headers:{'Cache-Control':'no-store'}});return Response.json(await manageManufacturingOrder(body,await currentHR()),{headers:{'Cache-Control':'no-store'}});}
 catch(error){return failure(error);}
}
