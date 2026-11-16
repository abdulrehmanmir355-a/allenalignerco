import { cookies } from "next/headers";
import { db } from "../../../lib/database";
import { digest, sameOrigin } from "../../../lib/portal-auth";
export async function POST(request: Request) {
 if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
 const jar = await cookies(); const token = jar.get("allen_hr_session")?.value;
 if (token) await db.query('DELETE FROM "HRSession" WHERE "tokenHash"=$1', [digest(token)]);
 jar.delete("allen_hr_session");
 return new Response(null, {status:303,headers:{Location:"/hr/login","Cache-Control":"no-store"}});
}
