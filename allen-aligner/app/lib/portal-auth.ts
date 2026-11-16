import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./database";
export const sessionCookie = "allen_doctor_session";
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export async function currentDoctor() {
 const token = (await cookies()).get(sessionCookie)?.value;
 if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
 const session = await db.doctorSession.findUnique({
  where: { tokenHash: digest(token) },
  include: { doctor: { select: {
   id: true, clinicId: true, fullName: true, email: true, clinicName: true,
   phone: true, registrationNumber: true, isVerified: true, createdAt: true, updatedAt: true
  } } }
 });
 if (!session || session.expiresAt <= new Date() || !session.doctor.isVerified || !session.doctor.clinicId) return null;
 return session.doctor;
}
// Restricted to the explicit clinic-setup route: ordinary doctor pages and APIs
// continue to require an already linked clinic through currentDoctor/apiDoctor.
export async function verifiedDoctorForClinicSetup() {
 const token=(await cookies()).get(sessionCookie)?.value;
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const session=await db.doctorSession.findUnique({where:{tokenHash:digest(token)},include:{doctor:{select:{id:true,clinicId:true,fullName:true,email:true,clinicName:true,isVerified:true}}}});
 if(!session||session.expiresAt<=new Date()||!session.doctor.isVerified||session.doctor.clinicId)return null;
 return session.doctor;
}
export async function requireDoctor() {
 const doctor = await currentDoctor();
 if (!doctor) redirect("/doctor-login");
 return doctor;
}
export async function startSession(doctorId: string) {
 const jar = await cookies();
 const old = jar.get(sessionCookie)?.value;
 if (old) await db.doctorSession.deleteMany({ where: { tokenHash: digest(old) } });
 const token = randomBytes(32).toString("hex");
 const expires = new Date(Date.now() + 8 * 60 * 60 * 1000);
 await db.doctorSession.create({ data: { tokenHash: digest(token), doctorId, expiresAt: expires } });
 jar.set(sessionCookie, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
}
export function ownCases(doctor: { id: string; clinicId: string | null }) {
 return { doctorId: doctor.id, clinicId: doctor.clinicId ?? "NO_CLINIC" };
}
export function sameOrigin(request: Request) {
 const origin = request.headers.get("origin");
 const expected = process.env.APP_ORIGIN || `${new URL(request.url).protocol}//${request.headers.get("host") || new URL(request.url).host}`;
 return origin === expected;
}
export async function throttle(key: string, limit = 10) {
 const now = new Date();
 await db.loginThrottle.deleteMany({ where: { key, expiresAt: { lte: now } } });
 const attempts = await db.loginThrottle.incrementThrottle(key, new Date(Date.now() + 15 * 60 * 1000));
 return attempts <= limit;
}


