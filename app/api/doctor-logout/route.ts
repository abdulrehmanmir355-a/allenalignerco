import { cookies } from "next/headers";
import { db } from "../../lib/database";
import { digest, sameOrigin, sessionCookie } from "../../lib/portal-auth";
export async function POST(request: Request) {
 if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
 const jar = await cookies(); const token = jar.get(sessionCookie)?.value;
 if (token) await db.doctorSession.deleteMany({ where: { tokenHash: digest(token) } });
 jar.delete(sessionCookie);
 return new Response(null, { status: 303, headers: { Location: "/doctor-login", "Cache-Control": "no-store" } });
}
