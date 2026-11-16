import { enrollNewCase } from '../../../lib/extended-case-workflow';
import { recordCaseActivity } from '../../../lib/case-activity';
import { z } from "zod";
import { db } from "../../../lib/database";
import { apiDoctor, failure, jsonBody, PortalError } from "../../../lib/portal-http";
import { caseIntakeSchema, encodeCaseIntake } from "../../../lib/case-intake";
const schema = z.object({ patientId: z.string().uuid(), category: z.enum(["Initial case","Follow-up","Refinement"]), notes: z.string().trim().max(5000), consent: z.literal("yes"), intake: caseIntakeSchema.optional() }).strict();
export async function POST(request: Request) {
  try {
    const doctor = await apiDoctor(request);
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, "Check patient reference, case type and authorization.");
    const body = parsed.data;
    const c = await db.transaction(async tx => {
      await tx.lockClinic(doctor.clinicId!);
      const patient = await tx.patient.findFirst({ where: { id: body.patientId, clinicId: doctor.clinicId!, archivedAt: null }, select: { patientCode: true } });
      if (!patient) throw new PortalError(404, "Patient not found in your clinic.");
      const duplicate = await tx.query(`SELECT id,status FROM "PortalCase"
        WHERE "clinicId"=$1 AND ("patientId"=$2 OR ("patientId" IS NULL AND "patientReference"=$3))
          AND category=$4 AND status<>'COMPLETED'
        ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`, [doctor.clinicId!, body.patientId, patient.patientCode, body.category]);
      if (duplicate.length) throw new PortalError(409, `This patient already has an open ${body.category.toLowerCase()} case in your clinic. Continue with that case instead of creating a duplicate.`);
      const created = await tx.portalCase.create({ data: { doctorId: doctor.id, clinicId: doctor.clinicId!, patientId: body.patientId, patientReference: patient.patientCode, category: body.category, notes: body.intake ? encodeCaseIntake(body.intake, body.notes) : body.notes, consentAt: new Date() } });
      await enrollNewCase(tx,created.id);
      await recordCaseActivity(tx,created.id,doctor.clinicId!,"Private draft created by doctor",{actor:{id:doctor.id,name:doctor.fullName,role:"DOCTOR"},action:"draft_created",fromStatus:null,status:created.status,notes:body.notes||null});
      return created;
    });
    return Response.json({ redirect: `/doctor-dashboard/cases/${c.id}` }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}

