import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./database";
import { currentOwner, endOwnerSession } from "./owner-auth";

const COOKIE = "allen_hr_session";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function currentHR() {
  // If legacy cookies contain more than one portal session, Owner takes
  // precedence and cannot inherit or retain HR authority at the same time.
  if (await currentOwner().catch(() => null)) return null;
  const token = (await cookies()).get(COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const rows = await db.query(
      `SELECT u."id", u."email", u."role"
       FROM "HRSession" s
       JOIN "HRUser" u ON u."id" = s."hrUserId"
       WHERE s."tokenHash" = $1
         AND s."expiresAt" > NOW()
         AND u."isActive" = TRUE
       LIMIT 1`,
      [hash(token)]
    );
    if (rows[0]) {
      return rows[0] as { id: string; email: string; role: string };
    }
  }

  // Owner authentication is separate and never grants HR access.
  return null;
}

export async function startHRSession(userId: string) {
  await endOwnerSession().catch(() => undefined);
  const previous = (await cookies()).get(COOKIE)?.value;
  if (previous) await db.query('DELETE FROM "HRSession" WHERE "tokenHash"=$1', [hash(previous)]);
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO "HRSession"
       ("tokenHash", "hrUserId", "expiresAt")
     VALUES ($1, $2, $3)`,
    [hash(token), userId, expires]
  );

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires
  });
}
