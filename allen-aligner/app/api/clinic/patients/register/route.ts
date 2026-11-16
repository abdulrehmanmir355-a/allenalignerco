import { randomUUID } from "node:crypto";
import { z } from "zod";
import { currentClinic } from "../../../../lib/clinic-auth";
import { clinicPermission } from "../../../../lib/clinic-management";
import { db } from "../../../../lib/database";
import { sameOrigin } from "../../../../lib/portal-auth";
import { failure, jsonBody, PortalError } from "../../../../lib/portal-http";
const patientSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  patientReference: z.string().trim().min(1).max(40),
});
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) {
      throw new PortalError(403, "Invalid request origin.");
    }
    const user = await currentClinic();
    if (!user) {
      throw new PortalError(401, "Clinic login required.");
    }
    clinicPermission(user, "patients", true);
    const parsed = patientSchema.safeParse(
      await jsonBody(request)
    );
    if (!parsed.success) {
      throw new PortalError(
        400,
        parsed.error.issues[0].message
      );
    }
    const { fullName, patientReference } = parsed.data;
    const saved = await db.transaction(async (tx) => {
      await tx.lockClinic(user.clinicId);
      const existing = await tx.query(
        `SELECT id FROM "Patient"
         WHERE "clinicId" = $1
           AND lower("patientCode") = lower($2)
         LIMIT 1`,
        [user.clinicId, patientReference]
      );
      if (existing.length) {
        throw new PortalError(
          409,
          "This clinic patient reference already exists."
        );
      }
      const rows = await tx.query(
        `INSERT INTO "Patient"
          (id, "clinicId", "patientCode", "fullName")
         VALUES ($1, $2, $3, $4)
         RETURNING id, "patientCode", "fullName"`,
        [
          randomUUID(),
          user.clinicId,
          patientReference,
          fullName,
        ]
      );
      return rows[0];
    });
    return Response.json(
      { success: true, patient: saved },
      { status: 201 }
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return failure(
        new PortalError(409, "Patient code already exists.")
      );
    }
    return failure(error);
  }
}
