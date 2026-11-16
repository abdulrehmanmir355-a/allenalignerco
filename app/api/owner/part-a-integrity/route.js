import { currentOwner } from "../../../lib/owner-auth";
import { db } from "../../../lib/database";

export const dynamic = "force-dynamic";

export async function GET() {
  const owner = await currentOwner();

  if (!owner) return Response.json({ error: "Owner access required" }, { status: 403 });

  try {
    const rows = await db.query(`
      SELECT
        'Doctor / Clinic mismatch' AS "name",
        COUNT(*)::integer AS "count"
      FROM "PortalCase" pc
      JOIN "Doctor" d ON d.id = pc."doctorId"
      WHERE d."clinicId" IS DISTINCT FROM pc."clinicId"

      UNION ALL

      SELECT
        'Document / Clinic mismatch',
        COUNT(*)::integer
      FROM "ClinicDocument" cd
      JOIN "ClinicUser" cu ON cu.id = cd."uploadedBy"
      WHERE cu."clinicId" IS DISTINCT FROM cd."clinicId"

      UNION ALL

      SELECT
        'Verified doctors without clinic',
        COUNT(*)::integer
      FROM "Doctor"
      WHERE "isVerified" = TRUE
        AND "clinicId" IS NULL

      UNION ALL

      SELECT
        'Active clinic users without clinic',
        COUNT(*)::integer
      FROM "ClinicUser"
      WHERE "isActive" = TRUE
        AND "clinicId" IS NULL

      UNION ALL

      SELECT
        'Pending doctor verifications',
        COUNT(*)::integer
      FROM "Doctor"
      WHERE "isVerified" = FALSE
    `);

    return Response.json(
      {
        success: true,
        checks: rows,
        checkedAt: new Date().toISOString()
      },
      {
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch {
    return Response.json(
      { error: "Database checks failed." },
      { status: 503 }
    );
  }
}
