import { z } from "zod";
import { currentHR } from "@/app/lib/hr-auth";
import { issueClinicalInvitation, issuePasswordResetCode, listClinicalInvitations, resendClinicalInvitation, revokeClinicalInvitation, searchAuthorizedEmployees } from "@/app/lib/clinical-registration/employee-invitation";
import { sameOrigin, throttle, digest } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await currentHR();
    if (!actor) throw new PortalError(401, "HR sign-in required.");
    const query = new URL(request.url).searchParams.get("q") || "";
    if (query) return Response.json({ employees: await searchAuthorizedEmployees(actor, query) }, { headers: { "Cache-Control": "private, no-store" } });
    return Response.json(await listClinicalInvitations(actor), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}

const issue = z.object({ action: z.literal("issue"), employeeId: z.string().trim().regex(/^AA-EMP-\d{6,12}$/), role: z.enum(["REVIEWER", "LEAD"]), reason: z.string().trim().min(5).max(1000) }).strict();
const passwordCode = z.object({ action: z.literal("issue-password-code"), employeeId: z.string().trim().regex(/^AA-EMP-\d{6,12}$/), reason: z.string().trim().min(5).max(1000) }).strict();
const revoke = z.object({ action: z.literal("revoke"), invitationId: z.string().uuid(), reason: z.string().trim().min(5).max(1000) }).strict();
const resend = z.object({ action: z.literal("resend"), invitationId: z.string().uuid(), reason: z.string().trim().min(5).max(1000) }).strict();

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const actor = await currentHR();
    if (!actor) throw new PortalError(401, "HR sign-in required.");
    if (!await throttle("clinical-invitation:" + digest(actor.id), 20)) throw new PortalError(429, "Too many invitation changes. Try again later.");
    const body = await jsonBody(request);
    if (body?.action === "revoke") {
      const parsed = revoke.safeParse(body);
      if (!parsed.success) throw new PortalError(400, "Invitation and a written reason are required.");
      return Response.json(await revokeClinicalInvitation(actor, parsed.data.invitationId, parsed.data.reason), { headers: { "Cache-Control": "no-store" } });
    }
    if (body?.action === "resend") {
      const parsed = resend.safeParse(body);
      if (!parsed.success) throw new PortalError(400, "Invitation and a written reason are required.");
      return Response.json(await resendClinicalInvitation(actor, parsed.data.invitationId, parsed.data.reason), { headers: { "Cache-Control": "no-store" } });
    }
    if (body?.action === "issue-password-code") {
      const parsed = passwordCode.safeParse(body);
      if (!parsed.success) throw new PortalError(400, "Choose an employee and a reason.");
      return Response.json(await issuePasswordResetCode(actor, parsed.data), { headers: { "Cache-Control": "no-store" } });
    }
    const parsed = issue.safeParse(body);
    if (!parsed.success) throw new PortalError(400, "Choose an employee, role, and reason.");
    return Response.json(await issueClinicalInvitation(actor, parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
