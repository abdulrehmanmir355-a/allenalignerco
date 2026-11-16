import { assetActor,assetRows,assetSave } from '@/app/lib/hr-assets';
import { db } from '@/app/lib/database';
import { failure,jsonBody,PortalError } from '@/app/lib/portal-http';
type Context={params:Promise<{id:string}>};
export async function GET(r:Request,c:Context){try{const a=await assetActor(r),{id}=await c.params;const [o]=await db.query('SELECT "employeeId" FROM "EmployeeOffboarding" WHERE id=$1',[id]);if(!o)throw new PortalError(404,'Offboarding not found.');const assets=await assetRows(String(o.employeeId),a);return Response.json({assets,clearance:{status:assets.some(v=>v.status==='ISSUED')?'PENDING':'CLEARED'}},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(r:Request,c:Context){try{const a=await assetActor(r),{id}=await c.params;const [o]=await db.query('SELECT "employeeId" FROM "EmployeeOffboarding" WHERE id=$1',[id]);if(!o)throw new PortalError(404,'Offboarding not found.');return Response.json(await assetSave(a,{...await jsonBody(r),employeeId:o.employeeId},id));}catch(e){return failure(e);}}
