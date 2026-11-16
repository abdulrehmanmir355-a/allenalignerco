
import { currentOwner } from "@/app/lib/owner-auth";
import { db } from "@/app/lib/database";
import { z } from "zod";
import { sameOrigin } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";
import { decideClinicalRegistration } from "@/app/lib/clinical-registration-decision";
import { suspendClinicalAccount } from "@/app/lib/clinical-registration/registration-approval";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const owner = await currentOwner();

    if (!owner) {
      return Response.json(
        { message: "Owner login required." },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const requests = await db.query(`
      SELECT
        w.id::text AS "accountId",
        e."permanentId" AS "employeeId",
        e."fullName" AS "employeeName",
        e.status AS "identityStatus",
        w."isActive" AS "accountActive",
        w."mustChangePassword" AS "mustChangePassword",
        w."clinicalRole" AS "currentClinicalRole",
        COALESCE(r.id::text, w."clinicalRequest"->>'id') AS "requestId",
        COALESCE(r."requestedRole", w."clinicalRequest"->>'role') AS "requestedRole",
        COALESCE(r.reason, w."clinicalRequest"->>'reason') AS "reason",
        COALESCE(r."requestedAt"::text, w."clinicalRequest"->>'requestedAt') AS "requestedAt"
      FROM "WorkAccount" w
      JOIN "ClinicalIdentity" e
        ON e."accountId" = w.id
      LEFT JOIN "ClinicalRegistrationRequest" r
        ON r."accountId" = w.id AND r.status = 'PENDING_APPROVAL'
      WHERE w."clinicalRequest"->>'status' = 'PENDING' OR r.id IS NOT NULL
      ORDER BY COALESCE(r."requestedAt"::text, w."clinicalRequest"->>'requestedAt')
      LIMIT 100
    `);

    const directory = await db.query(`
      SELECT
        e."permanentId" AS "employeeId",
        e."fullName" AS "employeeName",
        e.email AS email,
        e.status AS "identityStatus",
        w.role AS "accountRole",
        w."isActive" AS "accountActive",
        w."mustChangePassword" AS "mustChangePassword",
        w."clinicalRole" AS "clinicalRole",
        COALESCE(w."clinicalRequest"->>'status', '') AS "requestStatus"
      FROM "WorkAccount" w
      JOIN "ClinicalIdentity" e
        ON e."accountId" = w.id
      WHERE w."employeeId" IS NOT NULL
      ORDER BY e."permanentId"
      LIMIT 200
    `) as Array<{
      employeeId: string;
      employeeName: string;
      email: string | null;
      identityStatus: string;
      accountRole: string;
      accountActive: boolean;
      mustChangePassword: boolean;
      clinicalRole: string | null;
      requestStatus: string;
    }>;

    const ownerEmail = owner.email.toLowerCase();
    const appointmentDirectory = directory.map(row => {
      const ownAccount = !!row.email && row.email.toLowerCase() === ownerEmail;
      let blocker: string | null = null;
      if (ownAccount) blocker = "This account matches the signed-in Owner.";
      else if (row.accountRole === "CLINICAL_ONLY") blocker = "Standalone reviewers cannot become administrators.";
      else if (!row.accountActive || row.identityStatus !== "ACTIVE" || row.mustChangePassword) blocker = "Account must be active, identity verified, and the password change completed.";
      else if (row.requestStatus === "PENDING") blocker = "Resolve the pending registration before appointment.";
      else if (row.clinicalRole === "ADMIN") blocker = null;
      return {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        identityStatus: row.identityStatus,
        accountActive: row.accountActive,
        mustChangePassword: row.mustChangePassword,
        clinicalRole: row.clinicalRole,
        requestStatus: row.requestStatus || null,
        eligible: blocker === null && row.clinicalRole !== "ADMIN",
        blocker,
      };
    });

    return Response.json(
      {
        requests,
        administratorCount: appointmentDirectory.filter(row => row.clinicalRole === "ADMIN").length,
        administrators: appointmentDirectory.filter(row => row.clinicalRole === "ADMIN"),
        eligibleAdministrators: appointmentDirectory.filter(row => row.eligible),
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Owner clinical registrations loading failed:",
      error
    );

    return Response.json(
      {
        message:
          "Unable to load clinical registration requests.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}

const decisionSchema = z.object({
  accountId: z.string().uuid(),
  requestId: z.string().uuid(),
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(10).max(2000),
}).strict();

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const owner = await currentOwner();
    if (!owner) throw new PortalError(401, "Authenticated Owner access required.");
    const body = await jsonBody(request);
    if (body?.action === "suspend") {
      const parsed = z.object({ action: z.literal("suspend"), accountId: z.string().uuid(), reason: z.string().trim().min(10).max(2000) }).strict().safeParse(body);
      if (!parsed.success) throw new PortalError(400, "Account and a written reason are required.");
      const result = await db.transaction(tx => suspendClinicalAccount(tx, parsed.data.accountId, parsed.data.reason, { id: owner.id, role: "OWNER" }));
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) throw new PortalError(400, "Registration, decision and written reason are required.");
    await db.transaction(tx => decideClinicalRegistration(tx, parsed.data, {
      id: owner.id,
      name: owner.fullName,
      email: owner.email,
      role: "OWNER",
      source: "OWNER_COMMAND_CENTER",
    }));
    return Response.json({ message: "Registration decision recorded by Owner." }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
