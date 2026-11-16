import { clinicalActor,clinicalCase } from '@/app/lib/clinical-auth';
import { db } from '@/app/lib/database';
import { failure,PortalError } from '@/app/lib/portal-http';
import { safeFilename } from '@/app/lib/file-validation';
import { ensureLargeStorage,downloadObject } from '@/app/lib/large-upload-storage';
export const runtime='nodejs';
export async function GET(r:Request,{params}:{params:Promise<{id:string;kind:string;fileId:string}>}){try{
 const a=await clinicalActor(r),{id,kind,fileId}=await params;await clinicalCase(a,id);
 let name:string,mime:string,size:number,body:BodyInit;
 if(kind==='standard'){
  const f=await db.caseFile.findFirst({where:{id:fileId,caseId:id}});if(!f)throw new PortalError(404,'File not found.');
  name=f.name;mime=f.mime;size=f.size;body=new Uint8Array(f.data);
 }else if(kind==='large'){
  ensureLargeStorage();const f=await db.largeClinicalFile.findFirst({where:{id:fileId,caseId:id}});if(!f)throw new PortalError(404,'File not found.');
  name=f.originalName;mime=f.mime;size=f.sizeBytes;body=await downloadObject(f.storageKey,size);
 }else throw new PortalError(404,'File not found.');
 const inline=['image/png','image/jpeg','application/pdf'].includes(mime)&&new URL(r.url).searchParams.get('view')==='1';
 return new Response(body,{headers:{'Content-Type':mime,'Content-Length':String(size),'Content-Disposition':`${inline?'inline':'attachment'}; filename="${safeFilename(name)}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer'}});
 }catch(e){return failure(e);}}
