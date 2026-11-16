import ClinicNavigation from "../components/clinic-navigation";
import { currentDoctor } from "../lib/portal-auth";
import { currentClinic } from "../lib/clinic-auth";
import { redirect } from "next/navigation";
import ClinicManagementNavigation from "../components/clinic-management-navigation";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default async function Layout({children}:{children:React.ReactNode}){
 const [doctor,clinic]=await Promise.all([currentDoctor(),currentClinic()]);if(!doctor&&!clinic)redirect('/clinic-login');
 return <>{clinic?<ClinicManagementNavigation/>:<ClinicNavigation/>}{children}</>;
}
