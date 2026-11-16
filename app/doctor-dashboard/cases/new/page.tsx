import Link from "next/link";
import { notFound } from "next/navigation";
import PortalForm from "../../../components/portal-form";
import { requireDoctor } from "../../../lib/portal-auth";
import { db } from "../../../lib/database";
export default async function NewCase({ searchParams }: { searchParams: Promise<{ patientId?: string }> }) {
  const doctor = await requireDoctor();
  const { patientId } = await searchParams;
  const patient = patientId ? await db.patient.findFirst({ where: { id: patientId, clinicId: doctor.clinicId!, archivedAt: null }, select: { id: true, patientCode: true, fullName: true } }) : null;
  if (patientId && !patient) notFound();
  return <><Link href="/doctor-dashboard/cases">← All cases</Link><div className="page-heading"><div><h1>Start a case.</h1><p>Create a private draft, attach records, then submit to the laboratory.</p></div></div><section className="panel padded" style={{ width: "100%", maxWidth: 900, boxSizing: "border-box" }}><PortalForm action="/api/portal/cases" label="Create private draft">
    {patient ? <><p>Patient: {patient.fullName} ({patient.patientCode})</p><input type="hidden" name="patientId" value={patient.id} /><input type="hidden" name="patientReference" value={patient.patientCode} /></> : <><Link href="/clinic/patients">Choose a registered patient</Link><label>Patient reference<input name="patientReference" required minLength={2} maxLength={100} placeholder="Your clinic's patient reference" /></label></>}
    <label>Case type<select name="category"><option>Initial case</option><option>Follow-up</option><option>Refinement</option></select></label><label>Notes<textarea name="notes" maxLength={5000} rows={5} /></label><label className="checkbox"><input type="checkbox" name="consent" value="yes" required />I confirm authorization to share these records with the assigned laboratory.</label>
  </PortalForm></section></>;
}
