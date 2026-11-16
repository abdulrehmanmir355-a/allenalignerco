import { clinicalActor } from '@/app/lib/clinical-auth';
import { caseConversation,sendCaseCommunication } from '@/app/lib/case-communication';
import { failure,jsonBody } from '@/app/lib/portal-http';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,ctx:Context){try{const actor={kind:'internal' as const,actor:await clinicalActor(request)},query=new URL(request.url).searchParams;return Response.json(await caseConversation((await ctx.params).id,actor,query.get('before')||undefined,query.get('after')||undefined),{headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});}catch(e){return failure(e);}}
export async function POST(request:Request,ctx:Context){try{const actor={kind:'internal' as const,actor:await clinicalActor(request)};const result=await sendCaseCommunication((await ctx.params).id,actor,await jsonBody(request));return Response.json({...result,message:'Message saved to this case.'},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
