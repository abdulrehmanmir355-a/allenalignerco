import PasswordSettings from "../../components/password-settings";
import { currentHR } from "../../lib/hr-auth";
import { redirect } from "next/navigation";
export default async function Settings(){const hr=await currentHR();if(!hr)redirect('/hr/login');return <main className="container section"><h1>HR Profile and Account Settings</h1><p>{hr.email}</p><p>Role: {hr.role.replaceAll('_',' ')}</p><p>Sessions expire after eight hours. Logout revokes the current session immediately.</p><PasswordSettings kind="hr"/><form method="post" action="/api/hr/logout"><button className="button">Secure Logout</button></form></main>;}
