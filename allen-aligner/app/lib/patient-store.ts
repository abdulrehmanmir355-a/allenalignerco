import type { Database, Where } from "./database";
import "server-only";

import { patientData } from "./patient-validation";

export const patientSelect = { id: true, patientCode: true, fullName: true, dateOfBirth: true, phone: true, email: true, createdAt: true, revision: true, archivedAt: true };
export const patientHeaders = { "Cache-Control": "private, no-store" };

export async function matchingVerifiedClinicDoctorName(database: Database, clinicId: string, fullName: string): Promise<string | null> {
  const [doctor] = await database.query(
    `SELECT "fullName" FROM "Doctor"
     WHERE "clinicId"=$1 AND "isVerified"=true
       AND regexp_replace(lower(btrim("fullName")), '[[:space:]]+', ' ', 'g')
         = regexp_replace(lower(btrim($2)), '[[:space:]]+', ' ', 'g')
     LIMIT 1`,
    [clinicId, fullName]
  );
  return doctor?.fullName == null ? null : String(doctor.fullName);
}

export function duplicateWhere(clinicId: string, data: Pick<ReturnType<typeof patientData>, "normalizedPhone" | "normalizedEmail" | "normalizedName" | "dateOfBirth">, excludeId?: string): Where {
  const OR: Where[] = [];
  if (data.normalizedPhone) OR.push({ normalizedPhone: data.normalizedPhone });
  if (data.normalizedEmail) OR.push({ normalizedEmail: data.normalizedEmail });
  if (data.dateOfBirth) OR.push({ normalizedName: data.normalizedName, dateOfBirth: data.dateOfBirth });
  return { clinicId, ...(excludeId ? { id: { not: excludeId } } : {}), OR };
}

export function patientSnapshot(patient: { patientCode: string; fullName: string; dateOfBirth: Date | null; phone: string | null; email: string | null; clinicalNotes?: string | null; medicalHistory?: string | null; dentalHistory?: string | null }, extra?: { archivedAt: Date | null }) {
  return { patientCode: patient.patientCode, fullName: patient.fullName, dateOfBirth: patient.dateOfBirth?.toISOString().slice(0, 10) ?? null, phone: patient.phone, email: patient.email, clinicalNotes: patient.clinicalNotes ?? null, medicalHistory: patient.medicalHistory ?? null, dentalHistory: patient.dentalHistory ?? null, ...(extra ? { archivedAt: extra.archivedAt ? extra.archivedAt.toISOString() : null } : {}) };
}

export function duplicateResponse(candidates: { id: string; patientCode: string; fullName: string; archivedAt: Date | null }[]) {
  return Response.json({ code: "POSSIBLE_DUPLICATE", message: "A patient with matching contact details or name and birth date exists. Review the matches. Continue only if this is a different person.", candidates }, { status: 409, headers: patientHeaders });
}
