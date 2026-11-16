import { db } from "../../../../lib/database";
import { ownCases } from "../../../../lib/portal-auth";
import { apiDoctor, failure, PortalError } from "../../../../lib/portal-http";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {const d=await apiDoctor(request);const {id}=await params;const f=await db.caseFile.findFirst({where:{id,case:ownCases(d)}});if(!f)throw new PortalError(404,"File not found.");
 return new Response(new Uint8Array(f.data),{headers:{"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${f.name}"`,"Content-Length":String(f.size),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"}});
 }catch(e){return failure(e);}
}
