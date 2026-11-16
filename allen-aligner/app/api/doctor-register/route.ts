import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { jsonBody } from "../../lib/portal-http";
import { digest, sameOrigin, throttle } from "../../lib/portal-auth";
import { hashNewPassword, newPasswordSchema } from "../../lib/password-format";

import { db } from "../../lib/database";

const doctorSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  clinicName: z.string().trim().max(150).optional().default(""),
  email: z.email().max(254),
  phone: z.string().trim().min(7).max(30),
  registrationAuthority: z.string().trim().max(160).optional().default(""),
  registrationNumber: z.string().trim().max(100).optional().default(""),
  password: newPasswordSchema,
}).superRefine((value, context) => {
  if (value.registrationNumber && !value.registrationAuthority) context.addIssue({ code: "custom", path: ["registrationAuthority"], message: "Enter the authority that issued your professional registration number." });
});

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Invalid origin." }, { status: 403 });
  try {
    if (!await throttle("registration:global", 30)) return NextResponse.json({ message: "Registration temporarily limited. Try again later." }, { status: 429 });
    const body = await jsonBody(request);
    const result = doctorSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.error.issues[0]?.message || "Check the registration details and try again.",
        },
        { status: 400 }
      );
    }

    const data = result.data;
    const email = data.email.trim().toLowerCase();
    if (!await throttle("doctor-registration:" + digest(email), 5)) {
      return NextResponse.json({ message: "Too many registration attempts for this email. Try again later or contact support." }, { status: 429 });
    }
    const passwordHash = await hashNewPassword(data.password);
    const id = randomUUID();
    await db.query(`INSERT INTO "Doctor"(id,"fullName",email,"passwordHash","clinicName",phone,"registrationNumber","registrationAuthority","isVerified","createdAt","updatedAt")
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,now(),now())`, [id, data.fullName, email, passwordHash, data.clinicName || null, data.phone, data.registrationNumber || null, data.registrationAuthority || null]);

    return NextResponse.json(
      {
        success: true,
        message: "Doctor registration received. An Owner must verify your professional status before you can sign in. Clinic linking happens after verification.",
      },
      { status: 201 }
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      const constraint = "constraint" in error ? String(error.constraint) : "";
      return NextResponse.json(
        {
          success: false,
          message: constraint.includes("registrationNumber")
            ? "That professional registration number is already on file. Contact support if two practitioners share a number or you entered it incorrectly."
            : "An account already uses this email address. Sign in or contact support if it belongs to you.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Registration could not be completed.",
      },
      { status: 500 }
    );
  }
}
