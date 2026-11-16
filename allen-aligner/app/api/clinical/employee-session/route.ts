import { z } from "zod";
import { loginApprovedEmployee } from "@/app/lib/clinical-registration/employee-authentication";
import { digest, sameOrigin, throttle } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const parsed = z.object({
      employeeId: z.string().trim().min(3).max(40),
      password: z.string().min(1).max(72),
    }).strict().safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, "Enter the employee ID and password.");
    if (!await throttle("clinical-login:" + digest(parsed.data.employeeId.toLowerCase()), 10)) throw new PortalError(429, "Too many attempts. Try again later.");
    return Response.json(await loginApprovedEmployee(parsed.data.employeeId, parsed.data.password), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
