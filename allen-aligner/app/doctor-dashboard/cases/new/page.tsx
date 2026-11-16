import { requireDoctor } from "../../../lib/portal-auth";
import { db } from "../../../lib/database";
import NewCaseWizard from "./wizard";
import { decodeCaseIntake, decodeRecordFilename } from "../../../lib/case-intake";

export const dynamic = "force-dynamic";

export default async function NewCase({ searchParams }: { searchParams: Promise<{ caseId?: string; patientId?: string }> }) {
  const doctor = await requireDoctor();
  const { caseId, patientId: requestedPatientId } = await searchParams;
  const [patients, clinicDoctors] = await Promise.all([
    db.patient.findMany({
      where: { clinicId: doctor.clinicId!, archivedAt: null },
      select: { id: true, patientCode: true, fullName: true, dateOfBirth: true },
      orderBy: [{ fullName: "asc" }, { patientCode: "asc" }],
      take: 500,
    }),
    db.doctor.findMany({ where: { clinicId: doctor.clinicId!, isVerified: true }, select: { fullName: true }, take: 500 }),
  ]);
  const draft = caseId ? await db.portalCase.findFirst({ where: { id: caseId, doctorId: doctor.id, clinicId: doctor.clinicId!, status: "DRAFT" }, include: { files: { select: { name: true } }, largeFiles: { select: { originalName: true } } } }) : null;
  const draftPatient = draft?.patientId && !patients.some(p => p.id === draft.patientId)
    ? await db.patient.findFirst({ where: { id: draft.patientId, clinicId: doctor.clinicId!, archivedAt: null }, select: { id: true, patientCode: true, fullName: true, dateOfBirth: true } })
    : null;
  const patient = draft?.patientId ? patients.find(p => p.id === draft.patientId) ?? draftPatient ?? undefined : undefined;
  const requestedPatient = requestedPatientId && !patients.some(p => p.id === requestedPatientId)
    ? await db.patient.findFirst({ where: { id: requestedPatientId, clinicId: doctor.clinicId!, archivedAt: null }, select: { id: true, patientCode: true, fullName: true, dateOfBirth: true } })
    : null;
  const availablePatients = [...new Map([...patients, ...(draftPatient ? [draftPatient] : []), ...(requestedPatient ? [requestedPatient] : [])].map(p => [p.id, p])).values()].sort((a, b) => a.fullName.localeCompare(b.fullName) || a.patientCode.localeCompare(b.patientCode));
  const decoded = draft ? decodeCaseIntake(draft.notes) : null;
  const records: Record<string, number> = {};
  for (const file of [...(draft?.files.map(f => f.name) ?? []), ...(draft?.largeFiles.map(f => f.originalName) ?? [])]) {
    const type = decodeRecordFilename(file).recordType;
    if (type) records[type] = (records[type] || 0) + 1;
  }
  return <NewCaseWizard patients={availablePatients.map(patient => ({ ...patient, dateOfBirth: patient.dateOfBirth?.toISOString().slice(0, 10) ?? null }))} verifiedDoctorNames={clinicDoctors.map(item => item.fullName)} uploadsEnabled={process.env.ENABLE_PRIVATE_UPLOADS === "true"} initialPatientId={requestedPatient?.id ?? (requestedPatientId && patients.some(p => p.id === requestedPatientId) ? requestedPatientId : "")} initialDraft={draft && decoded?.intake && patient ? { id: draft.id, patientId: patient.id, category: draft.category, notes: decoded.notes, intake: decoded.intake, records } : null} />;
}
