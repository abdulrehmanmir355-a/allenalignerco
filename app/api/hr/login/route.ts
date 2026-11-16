import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { db } from "../../../lib/database";
import { digest, sameOrigin, throttle } from "../../../lib/portal-auth";
import { jsonBody } from "../../../lib/portal-http";
import { startHRSession } from "../../../lib/hr-auth";

export const runtime = "nodejs";
const schema = z.object({ email: z.email().max(254), password: z.string().min(1).max(72) });
type HRUserRow = { id: string; passwordHash: string; isActive: boolean; role: string };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  try {
    const input = schema.safeParse(await jsonBody(request));
    if (!input.success) return NextResponse.json({ message: "Invalid email or password." }, { status: 400 });
    const email = input.data.email.trim().toLowerCase();
    if (!await throttle("hr-login:" + digest(email), 10)) return NextResponse.json({ message: "Too many attempts. Try again later." }, { status: 429 });
    const users = await db.query(`SELECT "id","passwordHash","isActive","role" FROM "HRUser" WHERE LOWER("email")=$1 LIMIT 1`, [email]) as HRUserRow[];
    const user = users[0];
    if (!user || !(await compare(input.data.password, user.passwordHash))) return NextResponse.json({ message: "Invalid email or password." }, { status: 401 });
    if (!['HR_ADMIN','HR_OFFICER','HR_VIEWER'].includes(user.role)) return NextResponse.json({ message: "Use Audit Login for this account." }, { status: 403 });
    if (!user.isActive) return NextResponse.json({ message: "Your HR account is awaiting approval or is inactive. Please contact Allen administration." }, { status: 403 });
    await startHRSession(user.id);
    return NextResponse.json({ success: true, message: "HR login successful.", redirectTo: "/hr/offboarding/dashboard" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { const e = error as { name?: string; code?: string; message?: string }; console.error("HR_LOGIN_ERROR", { name: e?.name, code: e?.code, detail: e?.message?.replace(/postgres(?:ql)?:\/\/\S+/g, "[REDACTED]") }); return NextResponse.json({ message: "HR login unavailable." }, { status: 503 }); }
}
