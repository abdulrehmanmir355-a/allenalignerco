import { clinicalActor } from '@/app/lib/clinical-auth';
import { clinicalDashboard } from '@/app/lib/clinical-service';
import { failure } from '@/app/lib/portal-http';
export async function GET(r:Request){try{return Response.json(await clinicalDashboard(await clinicalActor(r)),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
