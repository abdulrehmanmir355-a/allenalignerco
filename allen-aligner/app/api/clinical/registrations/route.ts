import { z } from "zod";
import { clinicalActor } from "@/app/lib/clinical-auth";
import { db } from "@/app/lib/database";
import { listRegistrationRequests, suspendClinicalAccount } from "@/app/lib/clinical-registration/registration-approval";
import { sameOrigin } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertAdmin(role: string) {
  if (role !== "ADMIN") throw new PortalError(403, "Clinical administrator approval required.");
}

export async function GET(request: Request) {
  try {
    const actor = await clinicalActor(request);
    assertAdmin(actor.role);
    const url = new URL(request.url);
    const requests = await listRegistrationRequests({
      employeeId: url.searchParams.get("employeeId") || "",
      email: url.searchParams.get("email") || "",
      department: url.searchParams.get("department") || "",
      status: url.searchParams.get("status") || "",
    });
    return Response.json({ requests }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const actor = await clinicalActor(request);
    assertAdmin(actor.role);
    const parsed = z.object({
      action: z.literal("suspend"),
      accountId: z.string().uuid(),
      reason: z.string().trim().min(10).max(2000),
    }).strict().safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, "Account and a written reason are required.");
    if (parsed.data.accountId === actor.id) throw new PortalError(403, "You cannot suspend your own clinical access.");
    const result = await db.transaction(tx => suspendClinicalAccount(tx, parsed.data.accountId, parsed.data.reason, { id: actor.id, role: "ADMIN" }));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
