import { jsonBody, failure } from '../../lib/portal-http';
import { requireServiceActor, listService, serviceMeta, serviceDetail, createService, serviceAction, serviceSettings } from '../../lib/customer-service';
import { db } from '../../lib/database';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){try{const a=await requireServiceActor(request),url=new URL(request.url);if(url.searchParams.has('meta'))return reply(await serviceMeta(a));const id=url.searchParams.get('id');return reply(id?await serviceDetail(a,id):await listService(a,url));}catch(e){return failure(e);}}
export async function POST(request:Request){try{const a=await requireServiceActor(request),b=await jsonBody(request);if(b.operation==='create')return reply(await createService(a,b.ticket,request.headers.get('Idempotency-Key')),201);if(b.operation==='settings')return reply(await serviceSettings(a,b.settings));if(b.operation==='refresh'){if(a.role==='REQUESTER')return reply({message:'Customer service access required.'},403);await db.query('SELECT aa_service_refresh()');return reply({ok:true});}return reply(await serviceAction(a,b));}catch(e){return failure(e);}}
