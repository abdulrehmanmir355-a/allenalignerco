import { z } from "zod";
import { compare } from "bcryptjs";
import { ownerDb } from "@/app/lib/owner-database";
import { ensureOwnerHRAuditActor, startOwnerSession } from "@/app/lib/owner-auth";
import { digest, sameOrigin, throttle } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";

export const runtime = "nodejs";
const schema = z.object({ ownerId: z.string().trim().regex(/^AA-OWN-[A-Fa-f0-9]{10}$/), password: z.string().min(1).max(72) }).strict();
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, "Enter a valid Owner ID and password.");
    const ownerId = parsed.data.ownerId.toUpperCase();
    if (!await throttle("owner-login:" + digest(ownerId), 10)) throw new PortalError(429, "Too many attempts. Try again later.");
    const rows = await ownerDb.query<{ id: string; ownerId: string; fullName: string; email: string; passwordHash: string; isActive: boolean }>('SELECT id,"ownerId","fullName",email,"passwordHash","isActive" FROM "OwnerAccount" WHERE upper("ownerId")=$1 LIMIT 1', [ownerId]);
    const owner = rows[0];
    if (!owner || !(await compare(parsed.data.password, owner.passwordHash))) throw new PortalError(401, "Invalid Owner ID or password.");
    if (!owner.isActive) throw new PortalError(403, "Owner account is inactive.");
    await ensureOwnerHRAuditActor({ id: owner.id, ownerId: owner.ownerId, fullName: owner.fullName, email: owner.email, role: "OWNER" });
    await startOwnerSession(owner.id);
    return Response.json({ success: true, message: "Owner sign-in successful.", redirectTo: "/owner/command-center" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
