import { z } from "zod";
import { currentHR } from "@/app/lib/hr-auth";
import { issueOwnerInvitation, listOwnerInvitations, requireHRIssuer, revokeOwnerInvitation } from "@/app/lib/owner-invitations";
import { canRevokeOwnerInvitation } from "@/app/lib/owner-role-policy";
import { digest, sameOrigin, throttle } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("issue"), fullName: z.string().trim().min(2).max(150), email: z.email().max(254), reason: z.string().trim().min(5).max(1000) }).strict(),
  z.object({ action: z.literal("revoke"), invitationId: z.uuid(), reason: z.string().trim().min(5).max(1000) }).strict()
]);
export async function GET() {
  try { const actor = await currentHR(); requireHRIssuer(actor); return Response.json({ ...await listOwnerInvitations(), actor: { role: actor.role } }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const actor = await currentHR(); requireHRIssuer(actor);
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, "Check the Owner details, reason, and requested action.");
    if (!await throttle("owner-invitation:" + digest(actor.id), 20)) throw new PortalError(429, "Too many invitation changes. Try again later.");
    if (parsed.data.action === "issue") return Response.json(await issueOwnerInvitation(actor, parsed.data.fullName, parsed.data.email, parsed.data.reason), { status: 201, headers: { "Cache-Control": "no-store" } });
    if (!canRevokeOwnerInvitation(actor.role)) throw new PortalError(403, "Only HR Admins and Officers can revoke an Owner invitation.");
    return Response.json(await revokeOwnerInvitation(actor, parsed.data.invitationId, parsed.data.reason), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
