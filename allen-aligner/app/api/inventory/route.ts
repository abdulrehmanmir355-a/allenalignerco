import {currentHR} from '@/app/lib/hr-auth';
import {inventoryOverview,createInventoryItem} from '@/app/lib/inventory-management';
import {sameOrigin} from '@/app/lib/portal-auth';
import {failure,jsonBody,PortalError} from '@/app/lib/portal-http';
export async function GET(){try{return Response.json(await inventoryOverview(await currentHR()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
export async function POST(request:Request){try{if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');return Response.json({message:'Inventory item created.',...await createInventoryItem(await jsonBody(request),await currentHR())},{status:201,headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
