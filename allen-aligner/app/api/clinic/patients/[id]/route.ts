import { db } from "../../../../lib/database";
import { apiPatientAccess, failure, jsonBody, PortalError } from "../../../../lib/portal-http";
import { patientEditSchema, patientData } from "../../../../lib/patient-validation";
import { duplicateWhere, duplicateResponse, matchingVerifiedClinicDoctorName, patientSnapshot, patientSelect, patientHeaders } from "../../../../lib/patient-store";
import { patientTransaction } from "../../../../lib/patient-transaction";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const access = await apiPatientAccess(request);
    const { id } = await context.params;
    const patient = await db.patient.findFirst({ where: { id, clinicId: access.clinicId }, select: { ...patientSelect, clinicalNotes: true, medicalHistory: true, dentalHistory: true } });
    if (!patient) throw new PortalError(404, "Patient not found.");
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new PortalError(400, "Invalid page.");
    const casePage = Number(params.get("casePage") ?? 1);
    if (!Number.isSafeInteger(casePage) || casePage < 1 || casePage > 100000) throw new PortalError(400, "Invalid case page.");
    const where = { clinicId: access.clinicId, patientId: id };
    const [history, total] = await db.transaction(async tx => Promise.all([
      tx.query(`SELECT h.id,h.action,h.revision,h.before,h.after,h."createdAt",COALESCE(d."fullName",u."fullName",'Former clinic member') AS "actorName" FROM "PatientHistory" h LEFT JOIN "Doctor" d ON d.id=h."actorDoctorId" LEFT JOIN "ClinicUser" u ON u.id=h."actorClinicUserId" WHERE h."clinicId"=$1 AND h."patientId"=$2 ORDER BY h.revision DESC LIMIT 20 OFFSET $3`, [access.clinicId, id, (page - 1) * 20]),
      tx.patientHistory.count({ where }),
    ]));
    const caseWhere = { clinicId: access.clinicId, patientId: id };
    const [cases, casesTotal] = await db.transaction(async tx => Promise.all([
      tx.portalCase.findMany({ where: caseWhere, select: { id: true, patientReference: true, status: true, updatedAt: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 20, skip: (casePage - 1) * 20 }),
      tx.portalCase.count({ where: caseWhere }),
    ]));
    return Response.json({ patient, history, total, page, pageSize: 20, cases, casesTotal, casePage, casePageSize: 20 }, { headers: patientHeaders });
  } catch (e) { return failure(e); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const access = await apiPatientAccess(request, true);
    const { id } = await context.params;
    const parsed = patientEditSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, parsed.error.issues[0]?.message || "Check patient details.");
    const { revision, confirmDuplicate, ...fields } = parsed.data;
    const data = patientData(fields);
    const result = await patientTransaction(async tx => {
      await tx.lockClinic(access.clinicId);
      const previous = await tx.patient.findFirst({ where: { id, clinicId: access.clinicId, archivedAt: null }, select: { ...patientSelect, clinicalNotes: true, medicalHistory: true, dentalHistory: true } });
      if (!previous) throw new PortalError(404, "Patient not found.");
      if (data.patientCode !== previous.patientCode) throw new PortalError(400, "Patient ID cannot be changed.");
      if (previous.revision !== revision) throw new PortalError(409, "This record changed since you opened it. Reload the record before editing again.");
      if (!confirmDuplicate) {
        const doctorName = await matchingVerifiedClinicDoctorName(tx, access.clinicId, data.fullName);
        if (doctorName) return { doctorNameMatch: doctorName };
      }
      const candidates = await tx.patient.findMany({ where: duplicateWhere(access.clinicId, data, id), select: { id: true, patientCode: true, fullName: true, archivedAt: true }, take: 10 });
      if (candidates.length && !confirmDuplicate) return { candidates };
      const updated = await tx.patient.updateMany({ where: { id, clinicId: access.clinicId, archivedAt: null, revision }, data: { ...data, revision: { increment: 1 } } });
      if (updated.count !== 1) throw new PortalError(409, "This record changed. Reload before retrying.");
      const patient = await tx.patient.findUniqueOrThrow({ where: { id }, select: { ...patientSelect, clinicalNotes: true, medicalHistory: true, dentalHistory: true } });
      await tx.patientHistory.create({ data: { clinicId: access.clinicId, patientId: id, actorDoctorId: access.actorDoctorId, actorClinicUserId: access.actorClinicUserId, action: "UPDATED", revision: patient.revision, before: patientSnapshot(previous), after: patientSnapshot(patient) } });
      return { patient };
    });
    if ("doctorNameMatch" in result) return Response.json({ code: "DOCTOR_NAME_MATCH", message: "This name matches a verified doctor at your clinic. Confirm this is a real patient before saving the change.", matchedName: result.doctorNameMatch }, { status: 409, headers: patientHeaders });
    if ("candidates" in result && result.candidates) return duplicateResponse(result.candidates);
    return Response.json({ patient: result.patient }, { headers: patientHeaders });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "23505") return failure(new PortalError(409, "This patient code already exists in your clinic."));
    return failure(e);
  }
}
