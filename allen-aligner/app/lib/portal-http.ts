import { currentDoctor, sameOrigin } from "./portal-auth";
import { currentClinic } from "./clinic-auth";
export class PortalError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function apiDoctor(request: Request) {
 if (request.method !== "GET" && !sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
 const doctor = await currentDoctor(); if (!doctor) throw new PortalError(401, "Please sign in with a verified doctor account.");
 return doctor;
}
export async function apiPatientAccess(request: Request, write = false) {
 if (write && !sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
 const doctor = await currentDoctor();
 if (doctor?.clinicId) return { clinicId: doctor.clinicId, actorDoctorId: doctor.id, actorClinicUserId: null as string | null };
 const clinic = await currentClinic();
 if (!clinic) throw new PortalError(401, "Please sign in with a clinic or verified doctor account.");
 if (!clinic.canAccessPatients) throw new PortalError(403, "Patient access permission required.");
 if (write && clinic.role === "CLINIC_VIEWER") throw new PortalError(403, "Permission denied.");
 return { clinicId: clinic.clinicId, actorDoctorId: null, actorClinicUserId: clinic.id };
}
export function failure(error: unknown) { return Response.json({ message: error instanceof PortalError ? error.message : "Unable to complete request. Please retry." }, { status: error instanceof PortalError ? error.status : 503, headers: { "Cache-Control": "no-store" } }); }
export async function jsonBody(request: Request) {
 const reader = request.body?.getReader(); if (!reader) throw new PortalError(400,"Missing request body.");
 const chunks: Uint8Array[]=[]; let length=0;
 while(true) { const part=await reader.read(); if(part.done) break; length+=part.value.byteLength; if(length>20000) { await reader.cancel(); throw new PortalError(413,"Request too large."); } chunks.push(part.value); }
 try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new PortalError(400,"Invalid request body."); }
}
