import { z } from "zod";
import { registrationFields, clinicalRegistrationPolicy } from "@/app/lib/clinical-registration/policy";
import { registrationMessages } from "@/app/lib/clinical-registration/messages";
import { registrationStatus, submitClinicalRegistration } from "@/app/lib/clinical-registration/employee-registration";
import { digest, sameOrigin, throttle } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const submitSchema = z.object({
  action: z.literal("register"),
  employeeId: z.string().trim().regex(/^AA-EMP-\d{6,12}$/),
  email: z.email().max(254),
  fullName: z.string().trim().max(200).optional().or(z.literal("")),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  jobTitle: z.string().trim().max(120).optional().or(z.literal("")),
  employeeStatus: z.string().trim().max(20).optional().or(z.literal("")),
  invitationCode: z.string().trim().max(64).optional().or(z.literal("")),
  password: z.string().max(72).optional().or(z.literal("")),
  confirmPassword: z.string().max(72).optional().or(z.literal("")),
  role: z.enum(["REVIEWER", "LEAD"]).optional(),
  reason: z.string().trim().max(2000).optional().or(z.literal("")),
}).strict();

const statusSchema = z.object({
  action: z.literal("status"),
  employeeId: z.string().trim().regex(/^AA-EMP-\d{6,12}$/),
  email: z.email().max(254),
}).strict();

export async function GET() {
  return Response.json({
    fields: registrationFields(),
    policy: {
      invitationHours: clinicalRegistrationPolicy.invitationHours,
      passwordMin: clinicalRegistrationPolicy.passwordMin,
      passwordMax: clinicalRegistrationPolicy.passwordMax,
      hrInvitationActivatesAccess: clinicalRegistrationPolicy.hrInvitationActivatesAccess,
    },
    messages: { passwordRules: registrationMessages.passwordRules },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const body = await jsonBody(request);
    if (!await throttle("clinical-registration:global", 60)) throw new PortalError(429, "Too many attempts. Try again later.");
    if (body?.action === "status") {
      const parsed = statusSchema.safeParse(body);
      if (!parsed.success) throw new PortalError(400, "Enter the Employee ID and official email.");
      if (!await throttle("clinical-registration-status:" + digest(parsed.data.employeeId), 10)) throw new PortalError(429, "Too many attempts. Try again later.");
      return Response.json(await registrationStatus(parsed.data.employeeId, parsed.data.email), { headers: { "Cache-Control": "no-store" } });
    }
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) throw new PortalError(400, "Check the Employee ID, official email, and password.");
    if (!await throttle("clinical-registration:" + digest(parsed.data.employeeId), 8)) throw new PortalError(429, "Too many attempts. Try again later.");
    const { action, ...input } = parsed.data;
    void action;
    const result = await submitClinicalRegistration({
      ...input,
      fullName: input.fullName || undefined,
      department: input.department || undefined,
      jobTitle: input.jobTitle || undefined,
      employeeStatus: input.employeeStatus || undefined,
      invitationCode: input.invitationCode || undefined,
      password: input.password || undefined,
      confirmPassword: input.confirmPassword || undefined,
      reason: input.reason || undefined,
    });
    return Response.json(result, { status: result?.status === "APPROVED" ? 201 : 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof PortalError)) console.error("Clinical registration failed", error instanceof Error ? error.name : "Error");
    return failure(error);
  }
}
