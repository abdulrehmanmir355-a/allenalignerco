import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonBody } from "../../lib/portal-http";
import { sameOrigin, throttle } from "../../lib/portal-auth";
import { hashNewPassword, newPasswordSchema } from "../../lib/password-format";

import { db } from "../../lib/database";

const doctorSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  clinicName: z.string().trim().min(2).max(150),
  email: z.email().max(254),
  phone: z.string().trim().min(7).max(30),
  registrationNumber: z.string().trim().min(3).max(100),
  password: newPasswordSchema,
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
          message: "Invalid registration details.",
        },
        { status: 400 }
      );
    }

    const data = result.data;
    const passwordHash = await hashNewPassword(data.password);

    await db.doctor.create({
      data: {
        fullName: data.fullName,
        clinicName: data.clinicName,
        email: data.email.trim().toLowerCase(),
        phone: data.phone,
        registrationNumber: data.registrationNumber,
        passwordHash,
        isVerified: false,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Doctor registration received. Verification is pending.",
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error && typeof error === "object" && "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Email or registration number already exists.",
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
