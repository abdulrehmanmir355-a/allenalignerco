import Link from "next/link";
import { redirect } from "next/navigation";
import { currentClinic } from "../lib/clinic-auth";
import PortalForm from "../components/portal-form";
export default async function Page(){if(await currentClinic())redirect('/clinic/dashboard');return <main className="container section" style={{maxWidth:600}}><h1>Clinic Registration</h1><PortalForm action="/api/clinic/auth/register" label="Request Access"><label>Full name<input name="fullName" required minLength={2} maxLength={150}/></label><label>Clinic name<input name="clinicName" required minLength={2} maxLength={200}/></label><label>Email<input name="email" type="email" autoComplete="username" required maxLength={254}/></label><label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required/></label></PortalForm><p><Link href="/clinic-login">Clinic Login</Link></p></main>}
