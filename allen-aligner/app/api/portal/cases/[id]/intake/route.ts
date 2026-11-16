import { z } from "zod";
import { db } from "../../../../../lib/database";
import { apiDoctor, failure, jsonBody, PortalError } from "../../../../../lib/portal-http";
import { ownCases } from "../../../../../lib/portal-auth";
import { caseIntakeSchema, encodeCaseIntake } from "../../../../../lib/case-intake";

const schema = z.object({
  category: z.enum(["Initial case", "Follow-up", "Refinement"]),
  notes: z.string().trim().max(5000),
  intake: caseIntakeSchema,
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const doctor = await apiDoctor(request);
    const { id } = await params;
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, "Check the case type, instructions, and clinical information.");
    await db.transaction(async tx => {
      await tx.query('SELECT id FROM "PortalCase" WHERE id=$1 AND "doctorId"=$2 AND "clinicId"=$3 FOR UPDATE', [id, doctor.id, doctor.clinicId]);
      const current = await tx.portalCase.findFirst({ where: { id, ...ownCases(doctor) }, select: { id: true, status: true, revision: true } });
      if (!current) throw new PortalError(404, "Case draft not found.");
      if (current.status !== "DRAFT") throw new PortalError(409, "Only a draft can be edited.");
      await tx.portalCase.updateMany({
        where: { id, revision: current.revision, ...ownCases(doctor) },
        data: { category: parsed.data.category, notes: encodeCaseIntake(parsed.data.intake, parsed.data.notes), revision: { increment: 1 } },
      });
    });
    return Response.json({ message: "Case instructions saved." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
