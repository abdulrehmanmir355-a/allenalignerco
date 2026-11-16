import { enrollNewCase } from '../../../lib/extended-case-workflow';
import { recordCaseActivity } from '../../../lib/case-activity';
import { z } from "zod";
import { db } from "../../../lib/database";
import { apiDoctor, failure, jsonBody, PortalError } from "../../../lib/portal-http";
const schema = z.object({ patientReference: z.string().trim().min(1).max(100), patientId: z.string().uuid().optional(), category: z.enum(["Initial case","Follow-up","Refinement"]), notes: z.string().trim().max(5000), consent: z.literal("yes") }).strict();
export async function POST(request: Request) {
  try {
    const doctor = await apiDoctor(request);
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, "Check patient reference, case type and authorization.");
    const body = parsed.data;
    const c = await db.transaction(async tx => {
      let patientReference = body.patientReference;
      if (body.patientId) {
        await tx.lockClinic(doctor.clinicId!);
        const patient = await tx.patient.findFirst({ where: { id: body.patientId, clinicId: doctor.clinicId!, archivedAt: null }, select: { patientCode: true } });
        if (!patient) throw new PortalError(404, "Patient not found in your clinic.");
        patientReference = patient.patientCode;
      }
      const created = await tx.portalCase.create({ data: { doctorId: doctor.id, clinicId: doctor.clinicId!, patientId: body.patientId, patientReference, category: body.category, notes: body.notes, consentAt: new Date() } });
      await enrollNewCase(tx,created.id);
      await recordCaseActivity(tx,created.id,doctor.clinicId!,"Private draft created by doctor",{actor:{id:doctor.id,name:doctor.fullName,role:"DOCTOR"},action:"draft_created",fromStatus:null,status:created.status,notes:body.notes||null});
      return created;
    });
    return Response.json({ redirect: `/doctor-dashboard/cases/${c.id}` }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}

