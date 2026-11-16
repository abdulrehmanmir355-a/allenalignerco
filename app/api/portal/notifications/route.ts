import { db } from "../../../lib/database";
import { apiDoctor, failure, jsonBody, PortalError } from "../../../lib/portal-http";
export async function POST(request:Request){try{const d=await apiDoctor(request);const b=await jsonBody(request);if(typeof b.id!=="string")throw new PortalError(400,"Invalid notification.");const result=await db.notification.updateMany({where:{id:b.id,doctorId:d.id,readAt:null},data:{readAt:new Date()}});if(!result.count)throw new PortalError(404,"Unread notification not found.");return Response.json({message:"Marked read."});}catch(e){return failure(e);}}
