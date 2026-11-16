import PatientManagement from "../../components/patient-management";
import { currentClinic } from "../../lib/clinic-auth";
import { requireDoctor } from "../../lib/portal-auth";
import { clinicPermission } from "../../lib/clinic-management";
export default async function Page(){const clinic=await currentClinic();if(clinic){try{clinicPermission(clinic,"patients");}catch{return <main className="container section"><h1>Access restricted</h1><p>Your clinic administrator must grant patient access to your account.</p></main>;}return <PatientManagement canCreateCase={false}/>;}await requireDoctor();return <PatientManagement canCreateCase/>;}
