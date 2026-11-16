import { assetActor,assetRows,assetSave } from '@/app/lib/hr-assets';
import { failure,jsonBody,PortalError } from '@/app/lib/portal-http';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{const a=await assetActor(r),id=new URL(r.url).searchParams.get('employeeId');if(!id)throw new PortalError(400,'Select an employee.');return Response.json({assets:await assetRows(id,a)},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(r:Request){try{return Response.json(await assetSave(await assetActor(r),await jsonBody(r)));}catch(e){return failure(e);}}
