import { z } from "zod";
import { db } from "../../../lib/database";
import { apiDoctor, failure, jsonBody, PortalError } from "../../../lib/portal-http";
const schema = z.object({
  fullName: z.string().trim().min(2).max(150),
  phone: z.string().trim().max(30).refine(v => !v || (/^\+?[0-9 ()-]+$/.test(v) && v.replace(/\D/g, "").length >= 7), "Enter a valid phone number."),
  updatedAt: z.iso.datetime(),
}).strict();
export async function PATCH(request: Request) {
  try {
    const doctor = await apiDoctor(request);
    const input = schema.safeParse(await jsonBody(request));
    if (!input.success) throw new PortalError(400, "Check your name and phone number.");
    const { updatedAt, ...data } = input.data;
    const profile = await db.transaction(async tx => {
      await tx.query('SELECT id FROM "Doctor" WHERE id=$1 FOR UPDATE', [doctor.id]);
      const current = await tx.doctor.findUniqueOrThrow({where:{id:doctor.id},select:{isVerified:true,updatedAt:true}});
      if (!current.isVerified || current.updatedAt.getTime() !== new Date(updatedAt).getTime()) throw new PortalError(409, "Your profile changed. Reload the page before saving again.");
      const result = await tx.doctor.updateMany({where:{id:doctor.id, isVerified:true},data:{...data,phone:data.phone || null}});
      if (result.count !== 1) throw new PortalError(409, "Your profile changed. Reload the page before saving again.");
      return tx.doctor.findUniqueOrThrow({where:{id:doctor.id},select:{fullName:true,phone:true,updatedAt:true}});
    });
    return Response.json({profile},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) { return failure(error); }
}
