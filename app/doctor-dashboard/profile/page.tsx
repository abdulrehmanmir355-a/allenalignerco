import { requireDoctor } from "../../lib/portal-auth";
import DoctorProfileForm from "../../components/doctor-profile-form";
export default async function Profile() {
 const doctor=await requireDoctor();
 return <><div className="page-heading"><div><span className="eyebrow">ALLEN DOCTOR PORTAL</span><h1>Your profile</h1><p>Keep your contact details current for your Allen workspace.</p></div><span className="badge">Verified doctor</span></div><div className="portal-detail-grid"><section className="panel padded"><h2>Personal details</h2><DoctorProfileForm fullName={doctor.fullName} phone={doctor.phone} updatedAt={doctor.updatedAt.toISOString()}/></section><section className="panel padded"><h2>Professional account</h2><dl className="portal-facts"><dt>Email address</dt><dd>{doctor.email}</dd><dt>Registration number</dt><dd>{doctor.registrationNumber||"Not recorded"}</dd><dt>Account access</dt><dd>Active · professional verification passed</dd><dt>Registered</dt><dd>{doctor.createdAt.toISOString().slice(0,10)}</dd></dl><p>Contact Allen to request changes to your sign-in email or professional registration details.</p></section></div></>;
}
