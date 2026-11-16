import { randomUUID } from "node:crypto";
import type { Where } from "../../../lib/database";
import { db } from "../../../lib/database";
import { apiPatientAccess, failure, jsonBody, PortalError } from "../../../lib/portal-http";
import { patientCreateSchema, patientData, normalizeName } from "../../../lib/patient-validation";
import { duplicateWhere, duplicateResponse, matchingVerifiedClinicDoctorName, patientSnapshot, patientSelect as select, patientHeaders as headers } from "../../../lib/patient-store";

import { patientTransaction } from "../../../lib/patient-transaction";


export async function GET(request: Request) {
  try {
    const access = await apiPatientAccess(request);
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new PortalError(400, "Invalid page.");
    const q = params.get("q")?.trim() ?? "";
    if (q.length > 100) throw new PortalError(400, "Search must be 100 characters or fewer.");
    const archived = params.get("archived") === "1";
    const digits = q.replace(/\D/g, "");
    const where: Where = { clinicId: access.clinicId, archivedAt: archived ? { not: null } : null, ...(q ? { OR: [
      { patientCode: { contains: q.toUpperCase() } }, { normalizedName: { contains: normalizeName(q) } },
      { normalizedEmail: { contains: q.toLowerCase() } }, ...(digits.length >= 3 ? [{ normalizedPhone: { contains: digits } }] : []),
    ] } : {}) };
    const [patients, total] = await db.transaction(async tx => Promise.all([
      tx.patient.findMany({ where, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, skip: (page - 1) * 50 }),
      tx.patient.count({ where }),
    ]));
    return Response.json({ patients, total, page, pageSize: 50 }, { headers });
  } catch (error) { return failure(error); }
}




export async function POST(request: Request) {
  try {
    const access = await apiPatientAccess(request, true);
    const body = await jsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new PortalError(400, "Check patient details.");
    const email = Reflect.get(body, "email");
    if (typeof email !== "string" || !email.trim()) throw new PortalError(400, "Email Address is required.");
    const parsed = patientCreateSchema.safeParse(body);
    if (!parsed.success) throw new PortalError(400, parsed.error.issues[0]?.message || "Check patient details.");
    const { confirmDuplicate, ...fields } = parsed.data;
    const id = randomUUID();
    // The UUID remains the internal key; patientCode is the short, readable clinic ID.
    const data = patientData({ ...fields, patientCode: "P-0001" });
    if (!confirmDuplicate) {
      const doctorName = await matchingVerifiedClinicDoctorName(db, access.clinicId, data.fullName);
      if (doctorName) return Response.json({
        code: "DOCTOR_NAME_MATCH",
        message: "This name matches a verified doctor at your clinic. Confirm this is a real patient before creating a Patient ID.",
        matchedName: doctorName,
      }, { status: 409, headers });
    }
    // Serialize registrations within this clinic so duplicate-candidate checks do not race.
    const result = await patientTransaction(async tx => {
      await tx.lockClinic(access.clinicId);
      const lastCode = await tx.query(
        `SELECT MAX(CASE WHEN "patientCode" ~ '^P-[0-9]+$' THEN substring("patientCode" from 3)::integer END) AS "lastNumber"
         FROM "Patient" WHERE "clinicId"=$1`,
        [access.clinicId]
      );
      const nextNumber = Number(lastCode[0]?.lastNumber ?? 0) + 1;
      const patientCode = `P-${String(nextNumber).padStart(4, "0")}`;
      const patientDataWithCode = { ...data, patientCode };
      if (await tx.patient.findUnique({ where: { clinicId_patientCode: { clinicId: access.clinicId, patientCode } } })) throw new PortalError(409, "This patient code already exists in your clinic. Contact support before retrying.");
      const candidates = await tx.patient.findMany({ where: duplicateWhere(access.clinicId, patientDataWithCode), select: { id: true, patientCode: true, fullName: true, archivedAt: true }, take: 10 });
      if (candidates.length && !confirmDuplicate) return { candidates };
      const patient = await tx.patient.create({ data: { ...patientDataWithCode, id, clinicId: access.clinicId }, select: { ...select, clinicalNotes: true, medicalHistory: true, dentalHistory: true } });
      await tx.patientHistory.create({ data: { clinicId: access.clinicId, patientId: patient.id, actorDoctorId: access.actorDoctorId, actorClinicUserId: access.actorClinicUserId, action: "CREATED", revision: patient.revision, after: patientSnapshot(patient) } });
      return { patient };
    });
    if ("candidates" in result && result.candidates) return duplicateResponse(result.candidates);
    const patient = result.patient;
    return Response.json({ patient }, { status: 201, headers });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return failure(new PortalError(409, "This patient code already exists in your clinic. Check the existing record before registering again."));
    return failure(error);
  }
}
