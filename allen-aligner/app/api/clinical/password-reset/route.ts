import { z } from "zod";
import { confirmPasswordReset, redeemHrPasswordCode, requestPasswordReset } from "@/app/lib/clinical-registration/password-recovery";
import { digest, sameOrigin, throttle } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const body = await jsonBody(request);
    if (body?.action === "hr-code") {
      const parsed = z.object({
        action: z.literal("hr-code"),
        employeeId: z.string().trim(),
        code: z.string().trim(),
        password: z.string().max(72),
        confirmPassword: z.string().max(72),
      }).strict().safeParse(body);
      if (!parsed.success) throw new PortalError(400, "Enter the Employee ID, HR code, and a new password.");
      if (!await throttle("clinical-hr-code:" + digest(parsed.data.employeeId), 8)) throw new PortalError(429, "Too many attempts. Try again later.");
      return Response.json(await redeemHrPasswordCode(parsed.data.employeeId, parsed.data.code, parsed.data.password, parsed.data.confirmPassword), { headers: { "Cache-Control": "no-store" } });
    }
    if (body?.action === "confirm") {
      const parsed = z.object({
        action: z.literal("confirm"),
        token: z.string().trim(),
        password: z.string().max(72),
        confirmPassword: z.string().max(72),
      }).strict().safeParse(body);
      if (!parsed.success) throw new PortalError(400, "Enter and confirm the new password.");
      if (!await throttle("clinical-reset-confirm:" + digest(parsed.data.token), 8)) throw new PortalError(429, "Too many attempts. Try again later.");
      return Response.json(await confirmPasswordReset(parsed.data.token, parsed.data.password, parsed.data.confirmPassword), { headers: { "Cache-Control": "no-store" } });
    }
    const parsed = z.object({
      action: z.literal("request").optional(),
      email: z.email().max(254),
    }).strict().safeParse(body);
    if (!parsed.success) throw new PortalError(400, "Enter an official email address.");
    if (!await throttle("clinical-reset:" + digest(parsed.data.email.toLowerCase()), 5)) throw new PortalError(429, "Too many attempts. Try again later.");
    return Response.json(await requestPasswordReset(parsed.data.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
