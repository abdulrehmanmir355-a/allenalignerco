import { clinicalActor } from '@/app/lib/clinical-auth';
import { clinicalWorkspace,clinicalUpdate } from '@/app/lib/clinical-service';
import { failure,jsonBody } from '@/app/lib/portal-http';
type Context={params:Promise<{id:string}>};
export async function GET(r:Request,ctx:Context){try{return Response.json(await clinicalWorkspace(await clinicalActor(r),(await ctx.params).id),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
export async function POST(r:Request,ctx:Context){try{await clinicalUpdate(await clinicalActor(r),(await ctx.params).id,await jsonBody(r));return Response.json({message:'Clinical review saved.'},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
