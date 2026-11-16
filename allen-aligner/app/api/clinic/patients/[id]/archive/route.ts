import { apiPatientAccess, failure, jsonBody, PortalError } from "../../../../../lib/portal-http";
import { normalizeName, patientArchiveSchema } from "../../../../../lib/patient-validation";
import { duplicateWhere, duplicateResponse, matchingVerifiedClinicDoctorName, patientHeaders, patientSelect, patientSnapshot } from "../../../../../lib/patient-store";
import { patientTransaction } from "../../../../../lib/patient-transaction";

type Context = { params: Promise<{ id: string }> };

// Archiving is a reversible soft delete. Nothing is removed, so the complete
// patient history and every linked case stay intact and auditable.
export async function POST(request: Request, context: Context) {
  try {
    const access = await apiPatientAccess(request, true);
    const { id } = await context.params;
    const parsed = patientArchiveSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, parsed.error.issues[0]?.message || "Choose archive or restore and reload the patient first.");
    const { action, revision, confirmDuplicate } = parsed.data;
    const select = { ...patientSelect, clinicalNotes: true, medicalHistory: true, dentalHistory: true };
    const result = await patientTransaction(async tx => {
      await tx.lockClinic(access.clinicId);
      const previous = await tx.patient.findFirst({ where: { id, clinicId: access.clinicId }, select });
      if (!previous) throw new PortalError(404, "Patient not found.");
      if (previous.revision !== revision) throw new PortalError(409, "This record changed since you opened it. Reload the record before changing its archive state.");
      if (action === "ARCHIVE") {
        if (previous.archivedAt) return { patient: previous };
        const activeCases = await tx.portalCase.count({ where: { clinicId: access.clinicId, patientId: id, status: { not: "COMPLETED" } } });
        if (activeCases) throw new PortalError(409, `This patient has ${activeCases} active case${activeCases === 1 ? "" : "s"}. Complete or close the linked cases before archiving the patient.`);
        const archived = await tx.patient.updateMany({ where: { id, clinicId: access.clinicId, archivedAt: null, revision }, data: { archivedAt: new Date(), revision: { increment: 1 } } });
        if (archived.count !== 1) throw new PortalError(409, "This record changed. Reload before retrying.");
      } else {
        if (!previous.archivedAt) return { patient: previous };
        if (!confirmDuplicate) {
          const doctorName = await matchingVerifiedClinicDoctorName(tx, access.clinicId, previous.fullName);
          if (doctorName) return { confirmation: { code: "DOCTOR_NAME_MATCH" as const, matchedName: doctorName } };
          const candidates = await tx.patient.findMany({ where: duplicateWhere(access.clinicId, {
            normalizedName: normalizeName(previous.fullName),
            normalizedPhone: previous.phone?.replace(/\D/g, "") || null,
            normalizedEmail: previous.email?.toLowerCase() || null,
            dateOfBirth: previous.dateOfBirth,
          }, id), select: { id: true, patientCode: true, fullName: true, archivedAt: true }, take: 10 });
          if (candidates.length) return { confirmation: { code: "POSSIBLE_DUPLICATE" as const, candidates } };
        }
        const restored = await tx.patient.updateMany({ where: { id, clinicId: access.clinicId, revision }, data: { archivedAt: null, revision: { increment: 1 } } });
        if (restored.count !== 1) throw new PortalError(409, "This record changed. Reload before retrying.");
      }
      const patient = await tx.patient.findUniqueOrThrow({ where: { id, clinicId: access.clinicId }, select });
      await tx.patientHistory.create({ data: {
        clinicId: access.clinicId,
        patientId: id,
        actorDoctorId: access.actorDoctorId,
        actorClinicUserId: access.actorClinicUserId,
        action: action === "ARCHIVE" ? "ARCHIVED" : "RESTORED",
        revision: patient.revision,
        before: patientSnapshot(previous, { archivedAt: previous.archivedAt }),
        after: patientSnapshot(patient, { archivedAt: patient.archivedAt }),
      } });
      return { patient };
    });
    if ("confirmation" in result && result.confirmation) {
      const confirmation = result.confirmation;
      if (confirmation.code === "DOCTOR_NAME_MATCH") return Response.json({ code: confirmation.code, matchedName: confirmation.matchedName, message: "This patient name matches a verified doctor at your clinic. Confirm that this is genuinely a patient before restoring the record." }, { status: 409, headers: patientHeaders });
      if ("candidates" in confirmation && confirmation.candidates) return duplicateResponse(confirmation.candidates);
    }
    return Response.json(result, { headers: patientHeaders });
  } catch (error) { return failure(error); }
}
