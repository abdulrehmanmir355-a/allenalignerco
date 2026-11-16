import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().transform(v => v || null);
const optionalEmail = z.union([
  z.literal(""),
  z.string().trim().max(254).email("Enter a valid email address.").transform(value => value.toLowerCase()),
]).optional().transform(value => value || null);
const requiredEmail = z.string().trim().min(1, "Email Address is required.").max(254, "Email Address must be 254 characters or fewer.").email("Enter a valid email address.").transform(value => value.toLowerCase());
export const patientSchema = z.object({
  patientCode: z.string().trim().toUpperCase().min(1).max(40).regex(/^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/, "Use letters, numbers, hyphens or underscores for the patient code."),
  fullName: z.string().trim().min(2).max(200),
  dateOfBirth: z.string().optional().refine(v => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v && v <= new Date().toISOString().slice(0, 10) && v >= "1900-01-01"), "Enter a valid birth date between 1900 and today.").transform(v => v ? new Date(v + "T00:00:00.000Z") : null),
  phone: optionalText(40).refine(v => !v || (/^\+?[0-9 ()-]+$/.test(v) && v.replace(/\D/g, "").length >= 7), "Enter a valid phone number."),
  email: optionalEmail,
  clinicalNotes: optionalText(10000),
  medicalHistory: optionalText(10000),
  dentalHistory: optionalText(10000),
}).strict();

export const patientCreateSchema = patientSchema.omit({ patientCode: true }).extend({ email: requiredEmail, confirmDuplicate: z.boolean().optional().default(false) });
export const patientEditSchema = patientSchema.extend({ revision: z.number().int().min(0), confirmDuplicate: z.boolean().optional().default(false) });
export const patientArchiveSchema = z.object({
  action: z.enum(["ARCHIVE", "RESTORE"]),
  revision: z.number().int().min(0),
  confirmDuplicate: z.boolean().optional().default(false),
}).strict();
export const normalizeName = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export function patientData(input: z.output<typeof patientSchema>) {
  return { ...input, normalizedName: normalizeName(input.fullName), normalizedPhone: input.phone?.replace(/\D/g, "") || null, normalizedEmail: input.email?.toLowerCase() || null };
}
