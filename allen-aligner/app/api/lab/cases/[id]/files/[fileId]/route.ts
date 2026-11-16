import { db } from "../../../../../../lib/database";
import { digest } from "../../../../../../lib/portal-auth";
import { failure, PortalError } from "../../../../../../lib/portal-http";
export async function GET(request:Request,{params}:{params:Promise<{id:string;fileId:string}>}){try{
 const {id,fileId}=await params;const token=request.headers.get("authorization")?.replace(/^Bearer /,"");if(!token||!/^[a-f0-9]{64}$/.test(token))throw new PortalError(401,"Lab access required.");
 const access=await db.labAccess.findUnique({where:{caseId:id}});if(!access||access.tokenHash!==digest(token)||access.expiresAt<=new Date())throw new PortalError(403,"Lab access denied.");
 const f=await db.caseFile.findFirst({where:{id:fileId,caseId:id,case:{status:{not:"DRAFT"}}}});if(!f)throw new PortalError(404,"File not found.");
 return new Response(new Uint8Array(f.data),{headers:{"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${f.name}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"}});
 }catch(e){return failure(e);}}
