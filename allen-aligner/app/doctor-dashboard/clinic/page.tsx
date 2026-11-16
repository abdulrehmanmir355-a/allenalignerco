import Link from "next/link";
import { requireDoctor } from "../../lib/portal-auth";
import { db } from "../../lib/database";
export default async function Clinic() {
 const doctor=await requireDoctor();
 const [clinic,members,patients]=await Promise.all([
  db.clinic.findUniqueOrThrow({where:{id:doctor.clinicId!},select:{name:true}}),
  db.doctor.findMany({where:{clinicId:doctor.clinicId!},select:{id:true,fullName:true,isVerified:true},orderBy:{fullName:"asc"},take:200}),
  db.patient.count({where:{clinicId:doctor.clinicId!,archivedAt:null}}),
 ]);
 return <><div className="page-heading"><div><span className="eyebrow">YOUR CONNECTED PRACTICE</span><h1>{clinic.name}</h1><p>Your clinic, registered doctors and shared patient directory.</p></div><Link className="button secondary" href="/doctor-dashboard/patients">View patients</Link></div><div className="stats-grid"><section className="stat-card"><span>Active patient records</span><strong>{patients}</strong></section><section className="stat-card"><span>Doctors shown</span><strong>{members.length}</strong></section></div><section className="panel padded"><h2>Doctors &amp; users</h2><p>Up to 200 registered doctors. Each doctor’s cases remain under that doctor’s verified account. Clinic administrators can invite a verified doctor from Clinic Management → Users.</p><ul className="portal-member-list">{members.map(m=><li key={m.id}><div><strong>{m.fullName}{m.id===doctor.id?" (you)":""}</strong><small>Doctor</small></div><span className="badge">{m.isVerified?"Verified":"Pending verification"}</span></li>)}</ul><p>Clinic sign-in is for clinic administration. Case orders are submitted only from the linked doctor account, and an open case of the same type for the same Patient ID is rejected as a duplicate.</p></section></>;
}
