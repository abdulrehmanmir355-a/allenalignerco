import { currentDoctor } from "../lib/portal-auth";
import { redirect } from "next/navigation";
export default async function Layout({children}:{children:React.ReactNode}) {
 if(await currentDoctor()) redirect('/doctor-dashboard'); return children;
}
