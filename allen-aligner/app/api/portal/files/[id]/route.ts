import { db } from "../../../../lib/database";
import { ownCases } from "../../../../lib/portal-auth";
import { apiDoctor, failure, PortalError } from "../../../../lib/portal-http";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {const d=await apiDoctor(request);const {id}=await params;const f=await db.caseFile.findFirst({where:{id,case:ownCases(d)}});if(!f)throw new PortalError(404,"File not found.");
 const preview=new URL(request.url).searchParams.get("preview")==="1";if(preview&&!/\.(stl|ply|obj|glb)$/i.test(f.name))throw new PortalError(415,"Preview is available for STL, PLY and OBJ models only.");return new Response(new Uint8Array(f.data),{headers:{"Content-Type":"application/octet-stream","Content-Disposition":`${preview?"inline":"attachment"}; filename="${f.name.replace(/[\\"\r\n]/g,"_")}"`,"Content-Length":String(f.size),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
 }catch(e){return failure(e);}
}
