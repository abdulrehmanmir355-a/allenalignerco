import { currentHR } from "../../lib/hr-auth";
import { redirect } from "next/navigation";
export default async function Layout({children}:{children:React.ReactNode}) {
 if(await currentHR()) redirect('/hr/offboarding/dashboard'); return children;
}
