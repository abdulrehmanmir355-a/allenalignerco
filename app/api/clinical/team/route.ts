
import { z } from "zod";
import { db } from "@/app/lib/database";
import { clinicalActor } from "@/app/lib/clinical-auth";
import { assertOrdinaryTeamChange } from "@/app/lib/clinical-team-policy";
import { sameOrigin } from "@/app/lib/portal-auth";
import {
  failure,
  jsonBody,
  PortalError,
} from "@/app/lib/portal-http";

export async function POST(request: Request) {
  try {
    // Verify request origin before changing permissions.
    if (!sameOrigin(request)) {
      throw new PortalError(
        403,
        "Invalid request origin."
      );
    }

    // Only an existing Clinical Administrator may manage
    // ordinary clinical team permissions.
    const actor = await clinicalActor(request);

    if (actor.role !== "ADMIN") {
      throw new PortalError(
        403,
        "Authorized clinical administrator required."
      );
    }

    const schema = z.object({
      employeeId: z.string().trim().min(3).max(254),
      role: z.enum(["REVIEWER", "LEAD", "ADMIN"]).nullable(),
      reason: z.string().trim().min(10).max(1000),
    }).strict();

    const parsed = schema.safeParse(
      await jsonBody(request)
    );

    if (!parsed.success) {
      throw new PortalError(
        400,
        "Employee ID and a written reason of at least 10 characters are required."
      );
    }

    const input = parsed.data;
    assertOrdinaryTeamChange(input.role);

    await db.transaction(async (tx) => {
      const [employee] = await tx.query(
        `
        SELECT
          w.id,
          w.role,
          w."clinicalRole",
          w."clinicalRequest",
          w."isActive",
          e.status
        FROM "WorkAccount" w
        JOIN "ClinicalIdentity" e
          ON e."accountId" = w.id
        WHERE e."permanentId" = $1
        FOR UPDATE OF w
        `,
        [input.employeeId]
      );

      if (!employee) {
        throw new PortalError(
          404,
          "Employee account not found."
        );
      }

      if (employee.id === actor.id) {
        throw new PortalError(
          403,
          "An administrator cannot change their own clinical permission."
        );
      }

      // This endpoint may revoke ordinary access only. Grants must be
      // approved through the registration queue; ADMIN is Owner/DBA-only.
      if (employee.clinicalRole === "ADMIN") {
        throw new PortalError(
          403,
          "Clinical ADMIN removal requires Owner or authorized Database Administration."
        );
      }

      await tx.query(
        `
        UPDATE "WorkAccount"
        SET "clinicalRole" = NULL
        WHERE id = $1
        `,
        [employee.id]
      );

      await tx.query(
        `
        INSERT INTO "ClinicalReviewAudit"
          ("actorId", "actorName", action, detail)
        VALUES ($1, $2, 'TEAM_PERMISSION', $3::jsonb)
        `,
        [
          actor.id,
          actor.name,
          JSON.stringify({
            accountId: employee.id,
            before: employee.clinicalRole,
            registration: employee.clinicalRequest,
            after: input.role,
            reason: input.reason,
          }),
        ]
      );
    });

    return Response.json(
      { message: "Clinical permission updated." },
      { headers: { "Cache-Control": "no-store" } }
    );

  } catch (error) {
    return failure(error);
  }
}
