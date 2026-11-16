import { compare } from "bcryptjs";
import { z } from "zod";
import { failure, jsonBody, PortalError } from "../../lib/portal-http";
import { db } from "../../lib/database";
import { digest, sameOrigin, startSession, throttle, verifiedDoctorForClinicSetup } from "../../lib/portal-auth";
import { acceptDoctorClinicInvitation } from "../../lib/clinic-management";
import { hashNewPassword } from "../../lib/password-format";
const schema = z.object({ email: z.email().max(254), password: z.string().min(1).max(72), clinicInvite: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
export async function POST(request: Request) {
 if (!sameOrigin(request)) return Response.json({ message: "Invalid request origin." }, { status: 403 });
 try {
  if (Number(request.headers.get("content-length")) > 4096) return Response.json({ message: "Request too large." }, { status: 413 });
  const body = await jsonBody(request);
  if (body && typeof body === "object" && (body as { action?: unknown }).action === "register-clinic") {
   const doctor = await verifiedDoctorForClinicSetup();
   if (!doctor) return Response.json({ message: "Sign in with a professionally verified doctor account before registering a clinic." }, { status: 401 });
   const input = z.object({ action: z.literal("register-clinic"), name: z.string().trim().min(2).max(200), registrationAuthority: z.string().trim().min(2).max(120), registrationNumber: z.string().trim().min(2).max(120), address: z.string().trim().min(5).max(500), phone: z.string().trim().min(7).max(40), email: z.union([z.email().max(254),z.literal("")]), clinicPassword: z.string().min(12).max(72), confirmClinicPassword: z.string() }).strict().superRefine((value,ctx)=>{if(value.clinicPassword!==value.confirmClinicPassword)ctx.addIssue({code:'custom',path:['confirmClinicPassword'],message:'Clinic passwords do not match.'})}).safeParse(body);
   if (!input.success) return Response.json({ message: input.error.issues[0]?.message || "Enter the clinic's legal name, registration authority and number, contact details and a separate clinic password." }, { status: 400 });
   if (!await throttle("clinic-setup:" + doctor.id, 5)) return Response.json({ message: "Clinic setup attempts are temporarily limited." }, { status: 429 });
   const clinicPasswordHash=await hashNewPassword(input.data.clinicPassword);
   const clinic = await db.transaction(async tx => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [input.data.name.normalize("NFKC").trim().toLowerCase()]);
    const normalizedClinicNumber=input.data.registrationNumber.normalize("NFKC").trim().toLowerCase();
    const normalizedAuthority=input.data.registrationAuthority.normalize("NFKC").trim().toLowerCase();
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["clinic-registration:"+normalizedAuthority+":"+normalizedClinicNumber]);
    await tx.query('SELECT id FROM "Doctor" WHERE id=$1 FOR UPDATE', [doctor.id]);
    const current = await tx.doctor.findUniqueOrThrow({ where: { id: doctor.id } });
    if (current.clinicId) throw new Error("DOCTOR_ALREADY_LINKED");
    if ((await tx.query('SELECT id FROM "Clinic" WHERE LOWER(TRIM(name))=LOWER(TRIM($1)) LIMIT 1', [input.data.name])).length) throw new Error("CLINIC_NAME_EXISTS");
    if ((await tx.query('SELECT "clinicId" FROM "ClinicProfile" WHERE LOWER(TRIM("registrationAuthority"))=LOWER(TRIM($1)) AND LOWER(TRIM("registrationNumber"))=LOWER(TRIM($2)) LIMIT 1',[input.data.registrationAuthority,input.data.registrationNumber])).length) throw new Error("CLINIC_NUMBER_EXISTS");
    const existingUser = (await tx.query('SELECT id,"clinicId","isActive" FROM "ClinicUser" WHERE LOWER(email)=LOWER($1) FOR UPDATE', [current.email]))[0];
    if (existingUser?.isActive || existingUser?.clinicId) throw new Error("CLINIC_ACCOUNT_EXISTS");
    const created = await tx.clinic.create({ data: { name: input.data.name } });
    await tx.query('INSERT INTO "ClinicProfile" ("clinicId",address,phone,email,"registrationAuthority","registrationNumber") VALUES($1,$2,$3,$4,$5,$6)',[created.id,input.data.address,input.data.phone,input.data.email,input.data.registrationAuthority,input.data.registrationNumber]);
    if (existingUser) await tx.query('UPDATE "ClinicUser" SET "fullName"=$2,email=$3,"passwordHash"=$4,"clinicId"=$5,role=\'CLINIC_ADMIN\',"canAccessPatients"=true,"isActive"=false WHERE id=$1', [existingUser.id, current.fullName, current.email, clinicPasswordHash, created.id]);
    else await tx.query('INSERT INTO "ClinicUser" ("clinicId","fullName",email,"passwordHash",role,"canAccessPatients","isActive") VALUES($1,$2,$3,$4,\'CLINIC_ADMIN\',true,false)', [created.id, current.fullName, current.email, clinicPasswordHash]);
    await tx.doctor.update({ where: { id: doctor.id }, data: { clinicId: created.id, clinicName: created.name } });
    return created;
   });
   return Response.json({ success: true, redirect: "/doctor-dashboard", clinicName: clinic.name, message: "Clinic registered. An authorized operator must approve the clinic administrator account before clinic sign-in is enabled." }, { headers: { "Cache-Control": "no-store" } });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ message: "Invalid email or password." }, { status: 400 });
  const email = parsed.data.email.toLowerCase().trim();
  if (!await throttle("login:global", 120) || !await throttle("login:" + digest(email))) return Response.json({ message: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  const doctor = await db.doctor.findUnique({ where: { email } });
  const valid = await compare(parsed.data.password, doctor?.passwordHash ?? "$2b$12$abcdefghijklmnopqrstuuGJfDqHMTWvXlQxO8YLS2rkX3C6QbXb1q");
  if (!doctor || !valid) return Response.json({ message: "Invalid email or password." }, { status: 401 });
  if (!doctor.isVerified) return Response.json({ message: "Your account is awaiting professional verification." }, { status: 403 });
  if (parsed.data.clinicInvite) await acceptDoctorClinicInvitation(parsed.data.clinicInvite, doctor.id, doctor.email);
  await startSession(doctor.id);
  const redirect = doctor.clinicId || parsed.data.clinicInvite ? "/doctor-dashboard" : "/doctor-login?clinicSetup=1";
  return Response.json({ success: true, redirect, message: doctor.clinicId || parsed.data.clinicInvite ? "Signed in." : "Sign-in complete. Register a new clinic or ask a clinic administrator for an invitation." }, { headers: { "Cache-Control": "no-store" } });
 } catch (error) { const e = error as { name?: string; code?: string; constraint?: string; message?: string };if(error instanceof PortalError)return failure(error);if(e?.message==="CLINIC_NAME_EXISTS")return Response.json({message:"A clinic with this legal name already exists. Ask its administrator to invite your verified doctor account instead."},{status:409});if(e?.message==="CLINIC_NUMBER_EXISTS"||e?.constraint==="ClinicProfile_registration_identity_unique")return Response.json({message:"This registration authority and clinic number are already linked to a clinic. Ask its administrator to invite your verified doctor account instead."},{status:409});if(e?.message==="CLINIC_ACCOUNT_EXISTS")return Response.json({message:"This email is already associated with a clinic account. Ask that clinic administrator to invite your doctor account."},{status:409});if(e?.message==="DOCTOR_ALREADY_LINKED")return Response.json({message:"This doctor is already linked to a clinic. Contact Allen to review a membership change."},{status:409});console.error("DOCTOR_LOGIN_ERROR", { name: e?.name, code: e?.code, constraint:e?.constraint, detail: e?.message?.replace(/postgres(?:ql)?:\/\/\S+/g, "[REDACTED]") }); return Response.json({ message: "Clinic setup could not be completed. Please retry or contact support." }, { status: 503 }); }
}
