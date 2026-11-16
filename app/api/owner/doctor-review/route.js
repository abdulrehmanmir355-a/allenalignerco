import { currentOwner } from "../../../lib/owner-auth";
import { db } from "../../../lib/database";

export const dynamic = "force-dynamic";

export async function GET() {
  const owner = await currentOwner();

  if (!owner) return Response.json({ error: "Owner access required" }, { status: 403 });

  try {
    const doctors = await db.query(`
      SELECT id, "fullName", email, "clinicName",
             "registrationNumber", "createdAt"
      FROM "Doctor"
      WHERE "isVerified" = FALSE
      ORDER BY "createdAt" DESC
      LIMIT 100
    `);

    const count = await db.query(`
      SELECT COUNT(*)::integer AS total
      FROM "Doctor"
      WHERE "isVerified" = FALSE
    `);

    return Response.json(
      {
        doctors,
        total: count[0]?.total ?? 0
      },
      {
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch {
    return Response.json(
      { error: "Unable to load doctor records" },
      { status: 503 }
    );
  }
}
