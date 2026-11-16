import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./database";
import { currentOwner, endOwnerSession, ensureOwnerHRAuditActor } from "./owner-auth";
import { resolveHRAuthorizationActor } from "./owner-role-policy";

const COOKIE = "allen_hr_session";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function currentHR() {
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
      return resolveHRAuthorizationActor(
        rows[0] as { id: string; email: string; role: string },
        null,
        null
      );
    }
  }

  // A logged-in Owner uses its separate Owner DB session. This inactive HRUser
  // row exists solely for legacy HR audit foreign keys; it cannot authenticate.
  const owner = await currentOwner().catch(() => null);
  if (!owner) return null;
  await ensureOwnerHRAuditActor(owner);
  const [auditActor] = await db.query(
    `SELECT id,email,role,"isActive" FROM "HRUser" WHERE id=$1 LIMIT 1`,
    [owner.id]
  ) as {id:string;email:string;role:string;isActive:boolean}[];
  return resolveHRAuthorizationActor(null, owner, auditActor ?? null);
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
