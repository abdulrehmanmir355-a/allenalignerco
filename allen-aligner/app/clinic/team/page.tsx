import { currentClinic } from "../../lib/clinic-auth";
import { redirect } from "next/navigation";
import { requireDoctor } from "../../lib/portal-auth";
import { db } from "../../lib/database";
export default async function ClinicTeam() {
  if(await currentClinic())redirect("/clinic/manage/staff");
  const doctor = await requireDoctor();
  const members = await db.doctor.findMany({ where: { clinicId: doctor.clinicId! }, select: { id: true, fullName: true, isVerified: true }, orderBy: { fullName: "asc" }, take: 200 });
  return <main style={{ padding: "32px 5%", maxWidth: 1100, margin: "auto" }}><h1>Clinic team</h1><p>Registered doctors in your clinic. Showing up to 200 members.</p><section className="panel padded"><ul>{members.map(m => <li key={m.id}>{m.fullName}{m.id === doctor.id ? " (you)" : ""} — {m.isVerified ? "Verified" : "Verification pending"}</li>)}</ul></section><p>Member invitations and role administration are not enabled yet. Professional verification remains an authorized operator action.</p></main>;
}
