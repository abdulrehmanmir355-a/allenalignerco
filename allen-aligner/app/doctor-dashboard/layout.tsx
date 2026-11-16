import sidebarStyles from "./sidebar-fix.module.css";
import "./portal.css";
import PortalNav from "../components/portal-nav";
import { requireDoctor } from "../lib/portal-auth";
import DoctorWorkspaceBar from "./workspace-bar";
export const dynamic = "force-dynamic";
export const metadata = { title: "Doctor workspace", robots: { index: false, follow: false } };
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
 const doctor = await requireDoctor();
 return <div className={"portal " + sidebarStyles.root}><PortalNav/><main className="portal-main"><DoctorWorkspaceBar fullName={doctor.fullName} clinicName={doctor.clinicName}/>{children}</main></div>;
}
