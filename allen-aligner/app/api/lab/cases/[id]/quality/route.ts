import {authorizeCaseLab} from '@/app/lib/lab-auth';
import {productionQCView,createProductionQCInspection} from '@/app/lib/production-qc';
import {failure,jsonBody,PortalError} from '@/app/lib/portal-http';
import {sameOrigin} from '@/app/lib/portal-auth';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params;await authorizeCaseLab(request,id);return Response.json(await productionQCView(id),{headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}});}
 catch(error){return failure(error);}
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');
  const {id}=await params;const grant=await authorizeCaseLab(request,id);
  const result=await createProductionQCInspection(id,grant.label,await jsonBody(request));
  return Response.json(result,{headers:{'Cache-Control':'no-store',Vary:'Authorization'}});
 }catch(error){return failure(error);}
}
