import { z } from "zod";
import { activateOwnerInvitation } from "@/app/lib/owner-invitations";
import { digest, sameOrigin, throttle } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";

export const runtime = "nodejs";
const schema = z.object({ fullName: z.string().trim().min(2).max(150), email: z.email().max(254), token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(12).max(72), confirmPassword: z.string().max(72) }).strict();
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, "Enter your invited name, email, code, and a password of at least 12 characters.");
    if (Buffer.byteLength(parsed.data.password, "utf8") > 72) throw new PortalError(400, "Password is too long.");
    const key = digest(parsed.data.email.trim().toLowerCase() + ":" + parsed.data.token);
    if (!await throttle("owner-register:" + key, 10)) throw new PortalError(429, "Too many attempts. Try again later.");
    return Response.json(await activateOwnerInvitation(parsed.data), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
