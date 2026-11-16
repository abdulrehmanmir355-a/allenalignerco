
import { z } from "zod";
import { currentOwner } from "@/app/lib/owner-auth";
import { db } from "@/app/lib/database";
import { sameOrigin } from "@/app/lib/portal-auth";
import {
  failure,
  jsonBody,
  PortalError,
} from "@/app/lib/portal-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  employeeId: z.string().trim().min(3).max(254),
  action: z.enum(["APPOINT", "REMOVE"]),
  reason: z.string().trim().min(10).max(2000),
}).strict();

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) {
      throw new PortalError(
        403,
        "Invalid request origin."
      );
    }

    const owner = await currentOwner();

    if (!owner) {
      throw new PortalError(
        401,
        "Authenticated Owner access required."
      );
    }

    const parsed = schema.safeParse(
      await jsonBody(request)
    );

    if (!parsed.success) {
      throw new PortalError(
        400,
        "Employee ID, action and written reason required."
      );
    }

    const input = parsed.data;

    const result = await db.transaction(async (tx) => {
      const [employee] = await tx.query(
        `
        SELECT
          w.id,
          w.role,
          w."clinicalRole",
          w."clinicalRequest",
          w."isActive",
          w."mustChangePassword",
          e.status AS "identityStatus",
          e."fullName",
          e."permanentId",
          e.email
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
          "Clinical employee not found."
        );
      }

      if (
        employee.id === owner.id ||
        (employee.email && owner.email && String(employee.email).toLowerCase() === owner.email.toLowerCase())
      ) {
        throw new PortalError(403, "You cannot appoint or remove your own clinical access.");
      }

      const appoint = input.action === "APPOINT";
      const previousRole = employee.clinicalRole;

      if (appoint) {
        if (employee.role === "CLINICAL_ONLY") {
          throw new PortalError(
            403,
            "Standalone reviewers cannot become administrators."
          );
        }

        if (
          !employee.isActive ||
          employee.identityStatus !== "ACTIVE" ||
          employee.mustChangePassword
        ) {
          throw new PortalError(
            409,
            "Employee account must be active and identity verified."
          );
        }

        if (previousRole === "ADMIN") {
          throw new PortalError(
            409,
            "Employee is already a Clinical Administrator."
          );
        }

        if (employee.clinicalRequest?.status === "PENDING") {
          throw new PortalError(
            409,
            "Resolve the pending clinical registration first."
          );
        }
      } else {
        if (previousRole !== "ADMIN") {
          throw new PortalError(
            409,
            "Employee does not currently hold Clinical ADMIN access."
          );
        }
      }

      const newRole = appoint ? "ADMIN" : null;

      await tx.query(
        `
        UPDATE "WorkAccount"
        SET "clinicalRole" = $2
        WHERE id = $1
        `,
        [employee.id, newRole]
      );

      await tx.query(
        `
        INSERT INTO "ClinicalReviewAudit"
          ("actorId", "actorName", action, detail)
        VALUES ($1, $2, $3, $4::jsonb)
        `,
        [
          owner.id,
          owner.fullName,
          appoint
            ? "OWNER_CLINICAL_ADMIN_APPOINTED"
            : "OWNER_CLINICAL_ADMIN_REMOVED",
          JSON.stringify({
            accountId: employee.id,
            employeeId: employee.permanentId,
            employeeName: employee.fullName,
            before: previousRole,
            after: newRole,
            ownerId: owner.ownerId,
            decisionSource: "OWNER_COMMAND_CENTER",
            reason: input.reason,
            recordedAt: new Date().toISOString(),
          }),
        ]
      );

      return {
        message: appoint
          ? "Clinical Administrator appointed by Owner."
          : "Clinical Administrator access removed by Owner.",
        employeeId: employee.permanentId,
        previousRole,
        newRole,
      };
    });

    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });

  } catch (error) {
    return failure(error);
  }
}
