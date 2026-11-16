import "server-only";
import type { Database } from "@/app/lib/database";
import { db } from "@/app/lib/database";

export function appBaseUrl() {
  return (process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_ORIGIN || "").replace(/\/$/, "");
}

/** Sends when SMTP is configured. Otherwise records a redacted outbox row and returns the message to the caller only when they already hold the secret. */
export async function deliverClinicalEmail(input: {
  to: string;
  kind: string;
  subject: string;
  text: string;
}, database: Database = db) {
  let sentAt: Date | null = null;
  let error: string | null = null;
  const host = process.env.SMTP_HOST;
  if (host) {
    try {
      const nodemailer = await (new Function("return import('nodemailer')")() as Promise<{ createTransport?: (options: unknown) => { sendMail: (mail: unknown) => Promise<unknown> } }>).catch(() => null);
      if (!nodemailer?.createTransport) throw new Error("SMTP_HOST is set but nodemailer is not installed.");
      const transport = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" } : undefined,
      });
      await transport.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
      sentAt = new Date();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Email delivery failed.";
      console.error("Clinical email delivery failed", input.kind);
    }
  } else {
    error = "Email delivery is not configured. Set SMTP_HOST to send official email.";
  }
  const sink = process.env.NODE_ENV !== "production" && process.env.CLINICAL_MAIL_SINK === "1";
  await database.query(
    `INSERT INTO "ClinicalOutboundEmail"("toAddress",kind,subject,body,"sentAt",error) VALUES($1,$2,$3,$4,$5,$6)`,
    [input.to, input.kind, input.subject, sink ? input.text : "[redacted]", sentAt, error],
  );
  return { delivered: Boolean(sentAt), error };
}
