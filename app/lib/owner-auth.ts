import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { cookies } from "next/headers";
import { ownerDb } from "./owner-database";
import { db } from "./database";
import { matchesOwnerHRAuditActor, ownerHRAuditEmail } from "./owner-role-policy";

const COOKIE = "allen_owner_session";
export const ownerDigest = (value: string) => createHash("sha256").update(value).digest("hex");
export type OwnerActor = { id: string; ownerId: string; fullName: string; email: string; role: "OWNER" };

export async function currentOwner(): Promise<OwnerActor | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await ownerDb.query<OwnerActor>(
    `SELECT a.id,a."ownerId",a."fullName",a.email,'OWNER'::text AS role
     FROM "OwnerSession" s JOIN "OwnerAccount" a ON a.id=s."ownerId"
     WHERE s."tokenHash"=$1 AND s."expiresAt">clock_timestamp() AND a."isActive" LIMIT 1`,
    [ownerDigest(token)]
  );
  return rows[0] ?? null;
}

export async function startOwnerSession(ownerId: string) {
  const jar = await cookies();
  const previousHR = jar.get("allen_hr_session")?.value;
  if (previousHR && /^[a-f0-9]{64}$/.test(previousHR)) await db.query('DELETE FROM "HRSession" WHERE "tokenHash"=$1', [ownerDigest(previousHR)]);
  jar.delete("allen_hr_session");
  const previous = jar.get(COOKIE)?.value;
  if (previous) await ownerDb.query('DELETE FROM "OwnerSession" WHERE "tokenHash"=$1', [ownerDigest(previous)]);
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await ownerDb.query('INSERT INTO "OwnerSession"("tokenHash","ownerId","expiresAt") VALUES($1,$2,$3)', [ownerDigest(token), ownerId, expires]);
  jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
}

// HR audit tables reference HRUser. This inactive, randomly credentialed row is
// only an audit actor; Owner authentication remains exclusively in Owner DB.
export async function ensureOwnerHRAuditActor(owner: OwnerActor) {
  const email = ownerHRAuditEmail(owner.ownerId);
  let rows = await db.query(
    'SELECT id,email,role,"isActive" FROM "HRUser" WHERE id=$1 LIMIT 1', [owner.id]
  ) as { id: string; email: string; role: string; isActive: boolean }[];
  if (!matchesOwnerHRAuditActor(owner, rows[0] ?? null)) {
    if (rows.length) throw new Error("Owner audit actor conflicts with an existing HR account.");
    const passwordHash = await hash(randomBytes(48).toString("base64url"), 12);
    const fullName = (`Owner audit actor — ${owner.fullName}`).slice(0, 150);
    await db.query(`INSERT INTO "HRUser"(id,"fullName",email,"passwordHash",role,"isActive")
      VALUES($1,$2,$3,$4,'HR_ADMIN',FALSE) ON CONFLICT DO NOTHING`, [owner.id, fullName, email, passwordHash]);
    rows = await db.query(
      'SELECT id,email,role,"isActive" FROM "HRUser" WHERE id=$1 LIMIT 1', [owner.id]
    ) as { id: string; email: string; role: string; isActive: boolean }[];
    if (!matchesOwnerHRAuditActor(owner, rows[0] ?? null)) throw new Error("Could not prepare the Owner HR audit actor.");
  }
}

export async function endOwnerSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  try {
    if (token && /^[a-f0-9]{64}$/.test(token)) await ownerDb.query('DELETE FROM "OwnerSession" WHERE "tokenHash"=$1', [ownerDigest(token)]);
  } finally { jar.delete(COOKIE); }
}
