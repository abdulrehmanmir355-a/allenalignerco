import { recordCaseActivity } from '../../../../../lib/case-activity';
import { db } from "../../../../../lib/database";
import { ownCases } from "../../../../../lib/portal-auth";
import { apiDoctor, failure, PortalError } from "../../../../../lib/portal-http";
import { maxFileBytes, safeFilename, validateFile } from "../../../../../lib/file-validation";
import { caseRecordTypes, decodeRecordFilename, encodeRecordFilename, type CaseRecordType } from "../../../../../lib/case-intake";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {
  const d=await apiDoctor(request);const {id}=await params;
  const owned=await db.portalCase.findFirst({where:{id,...ownCases(d)},select:{id:true}});if(!owned)throw new PortalError(404,"Case not found.");
  const files=await db.caseFile.findMany({where:{caseId:id},select:{id:true,name:true,size:true,mime:true,createdAt:true},orderBy:{createdAt:"desc"}});
  return Response.json({files:files.map(f=>({id:f.id,name:decodeRecordFilename(f.name).filename,recordType:decodeRecordFilename(f.name).recordType,size:f.size,mime:f.mime,createdAt:f.createdAt}))},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return failure(e);}
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {
  const d=await apiDoctor(request);const {id}=await params;
  if(process.env.ENABLE_PRIVATE_UPLOADS!=="true")throw new PortalError(503,"File intake is disabled until private storage is configured.");
  const owned=await db.portalCase.findFirst({where:{id,...ownCases(d)},select:{id:true}});if(!owned)throw new PortalError(404,"Case not found.");
  const limit=maxFileBytes+65536;const reader=request.body?.getReader();if(!reader)throw new PortalError(400,"File required.");
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();throw new PortalError(413,"Maximum file size is 10 MB.");}chunks.push(part.value);}
  const bounded=new Request(request.url,{method:"POST",headers:{"Content-Type":request.headers.get("content-type")||""},body:Buffer.concat(chunks)});
  let data:FormData;try{data=await bounded.formData();}catch{throw new PortalError(400,"Invalid upload.");}
  const file=data.get("file");if(!(file instanceof File)||data.getAll("file").length!==1)throw new PortalError(400,"Choose one file.");
  const recordType=data.get("recordType");if(recordType!==null&&(typeof recordType!=="string"||!caseRecordTypes.includes(recordType as typeof caseRecordTypes[number])))throw new PortalError(400,"Choose whether this record is a scan, clinical photo, or X-ray.");
  const bytes=Buffer.from(await file.arrayBuffer());const mime=validateFile(file.name,bytes);if(!mime)throw new PortalError(400,"Use a valid PDF, JPEG, PNG or STL file, up to 10 MB.");
  const savedFile = await db.transaction(async tx=>{
   const c=await tx.portalCase.findFirst({where:{id,...ownCases(d)},include:{_count:{select:{files:true}}}});if(!c)throw new PortalError(404,"Case not found.");
   if(!["DRAFT","CHANGES_REQUESTED"].includes(c.status))throw new PortalError(409,"Records can be added to drafts or cases requiring changes.");
   if(c._count.files>=20)throw new PortalError(409,"Maximum 20 records per case.");
   const lock=await tx.portalCase.updateMany({where:{id,revision:c.revision},data:{revision:{increment:1}}});if(lock.count!==1)throw new PortalError(409,"Case changed. Retry upload.");
   const wizardCase=String(c.notes||'').includes('[ALLEN_CASE_INTAKE_V1]');
   if(wizardCase&&!recordType)throw new PortalError(400,"Choose whether this record is a scan, clinical photo, or X-ray.");
   const storedName=recordType?encodeRecordFilename(recordType as CaseRecordType,safeFilename(file.name)):safeFilename(file.name);
   const saved = await tx.caseFile.create({data:{caseId:id,name:storedName,mime,size:bytes.length,data:bytes}});
   await recordCaseActivity(tx,id,c.clinicId,"Doctor attached a private record",{actor:{id:d.id,name:d.fullName,role:"DOCTOR"},action:"file_attached",fromStatus:c.status,status:c.status,notes:null});
   return {id:saved.id,name:saved.name,size:saved.size};
  });return Response.json({message:"Private record stored.",file:{...savedFile,name:decodeRecordFilename(savedFile.name).filename,recordType:decodeRecordFilename(savedFile.name).recordType}},{status:201,headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return failure(e);}
}
