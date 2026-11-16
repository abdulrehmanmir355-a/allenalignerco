import {currentHR} from '@/app/lib/hr-auth';
import {productionDashboard} from '@/app/lib/production-management';
import {failure} from '@/app/lib/portal-http';

export const dynamic='force-dynamic';
export async function GET(){
 try{return Response.json(await productionDashboard(await currentHR()),{headers:{'Cache-Control':'private, no-store'}});}
 catch(error){return failure(error);}
}
