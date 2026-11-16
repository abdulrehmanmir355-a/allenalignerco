import { z } from "zod";

export const caseIntakeSchema = z.object({
  product: z.enum(["Clear aligner", "Retainer", "Refinement"]),
  arch: z.enum(["Upper", "Lower", "Both"]),
  treatmentGoal: z.string().trim().min(5).max(2000),
  extraction: z.enum(["No", "Yes", "Under discussion"]),
  ipr: z.enum(["No", "Yes", "Planner to assess"]),
  attachments: z.enum(["No", "Yes", "Planner to assess"]),
  medicalHistory: z.string().trim().max(3000),
  dentalHistory: z.string().trim().max(3000),
  allergies: z.string().trim().max(2000),
  specialInstructions: z.string().trim().max(3000),
  reviewed: z.literal("yes"),
}).strict();

export type CaseIntake = z.infer<typeof caseIntakeSchema>;
export const caseRecordTypes = ["scan", "photo", "xray"] as const;
export type CaseRecordType = typeof caseRecordTypes[number];
export const caseRecordExtensions: Record<CaseRecordType, readonly string[]> = {
  scan: ["stl", "ply", "obj", "3mf", "wrl", "vrml", "glb", "gltf", "dae", "fbx", "off", "zip"],
  photo: ["jpg", "jpeg", "png", "pdf"],
  xray: ["dcm", "zip", "pdf", "jpg", "jpeg", "png"],
};
export function isValidCaseRecordFile(type: CaseRecordType, filename: string) {
  const extension = filename.toLowerCase().split(".").pop() || "";
  return caseRecordExtensions[type].includes(extension);
}

const intakeMarker = "\n\n[ALLEN_CASE_INTAKE_V1]\n";
const fileMarker = /^\[AA-RECORD:(scan|photo|xray)\] /;

export function encodeCaseIntake(intake: CaseIntake, notes: string) {
  return `${notes.trim()}${intakeMarker}${JSON.stringify(intake)}`;
}

export function decodeCaseIntake(notes: string) {
  const at = notes.lastIndexOf(intakeMarker);
  if (at < 0) return { notes, intake: null as CaseIntake | null };
  let value: unknown;
  try { value = JSON.parse(notes.slice(at + intakeMarker.length)); } catch { return { notes, intake: null as CaseIntake | null }; }
  const parsed = caseIntakeSchema.safeParse({ ...(value as Record<string, unknown>), reviewed: "yes" });
  if (!parsed.success) return { notes, intake: null as CaseIntake | null };
  return { notes: notes.slice(0, at).trim(), intake: parsed.data };
}

export function encodeRecordFilename(type: CaseRecordType, filename: string) {
  return `[AA-RECORD:${type}] ${filename}`;
}

export function decodeRecordFilename(filename: string) {
  const match = filename.match(fileMarker);
  return { recordType: (match?.[1] as CaseRecordType | undefined) ?? null, filename: filename.replace(fileMarker, "") };
}

export function requiredCaseRecordTypes(arch: CaseIntake["arch"]): CaseRecordType[] {
  return arch === "Both" ? ["scan", "photo", "xray"] : ["scan", "photo"];
}

export function missingCaseRecordTypes(arch: CaseIntake["arch"], records: string[]) {
  const present = new Set(records);
  return requiredCaseRecordTypes(arch).filter(type => !present.has(type));
}
