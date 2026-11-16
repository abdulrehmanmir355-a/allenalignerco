import { currentClinic } from "../../lib/clinic-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireDoctor, ownCases } from "../../lib/portal-auth";
import { db } from "../../lib/database";
export default async function ClinicDashboard() {
  if(await currentClinic())redirect("/clinic/manage/dashboard");
  const doctor = await requireDoctor();
  const where = ownCases(doctor);
  const [patients, doctors, cases, review, recent] = await Promise.all([
    db.patient.count({ where: { clinicId: doctor.clinicId!, archivedAt: null } }),
    db.doctor.count({ where: { clinicId: doctor.clinicId!, isVerified: true } }),
    db.portalCase.count({ where }), db.portalCase.count({ where: { ...where, status: "REVIEW" } }),
    db.portalCase.findMany({ where, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, patientReference: true, status: true, updatedAt: true } }),
  ]);
  return <main style={{ padding: "35px 5%", background: "#f4f8fa", minHeight: "100vh" }}><div style={{ maxWidth: 1150, margin: "auto" }}><h1>Clinic Dashboard</h1><p>Clinic patients and your private case activity.</p>
    <div className="stats-grid">{[["Active clinic patients", patients], ["Verified clinic doctors", doctors], ["Your cases", cases], ["Your reviews", review]].map(([label, n]) => <article className="stat-card" key={label}><span>{label}</span><strong>{n}</strong></article>)}</div>
    <section className="panel padded"><h2>Workspace</h2><div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}><Link href="/clinic/patients">Patient records</Link><Link href="/doctor-dashboard/cases/new">New case</Link><Link href="/doctor-dashboard/cases">Your cases</Link><Link href="/doctor-dashboard/notifications">Notifications</Link><Link href="/clinic/team">Clinic team</Link></div></section>
    <section className="panel padded" style={{ marginTop: 20 }}><h2>Your recent case activity</h2>{!recent.length && <p>No cases yet.</p>}<ul>{recent.map(c => <li key={c.id}><Link href={`/doctor-dashboard/cases/${c.id}`}>{c.patientReference}</Link> — {c.status.replaceAll("_", " ")} · {c.updatedAt.toISOString().slice(0, 10)}</li>)}</ul><p>Case details remain restricted to their assigned doctor.</p></section>
  </div></main>;
}
