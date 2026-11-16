import { workActor } from '@/app/lib/work-auth';
import { identityData, identitySave } from '@/app/lib/identity-service';
import { failure, jsonBody } from '@/app/lib/portal-http';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{return Response.json(await identityData(await workActor(r)),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
export async function POST(r:Request){try{return Response.json(await identitySave(await workActor(r),await jsonBody(r)),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
