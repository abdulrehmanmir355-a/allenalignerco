import ClinicNavigation from "../components/clinic-navigation";
import { currentDoctor } from "../lib/portal-auth";
import { currentClinic } from "../lib/clinic-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default async function Layout({children}:{children:React.ReactNode}){
 const [doctor,clinic]=await Promise.all([currentDoctor(),currentClinic()]);if(!doctor&&!clinic)redirect('/clinic-login');
 return <>{clinic?<nav className="management-nav" aria-label="Clinic workspace">{['dashboard','profile','staff','users','patients','appointments','cases','documents','settings'].map(s=><Link key={s} href={s==='patients'?'/clinic/patients':'/clinic/manage/'+s}>{s==='patients'?'Patient Master':s.charAt(0).toUpperCase()+s.slice(1)}</Link>)}<form method="post" action="/api/clinic/auth/logout"><button>Logout</button></form></nav>:<ClinicNavigation/>}{children}</>;
}
