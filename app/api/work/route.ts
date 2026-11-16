import { z } from 'zod';
import { workActor } from '../../lib/work-auth';
import { workData,workSave } from '../../lib/work-service';
import { failure,jsonBody,PortalError } from '../../lib/portal-http';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{return Response.json(await workData(await workActor(r)),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e)}}
export async function POST(r:Request){try{return Response.json(await workSave(await workActor(r),await jsonBody(r)));}catch(e){if(e instanceof z.ZodError)return failure(new PortalError(400,e.issues[0].message));if(e&&typeof e==='object'&&'code'in e&&e.code==='23505')return failure(new PortalError(409,'A report or revision already exists.'));return failure(e)}}
