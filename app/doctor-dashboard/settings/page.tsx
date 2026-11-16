import PasswordSettings from "../../components/password-settings";
import Link from "next/link";
import { requireDoctor } from "../../lib/portal-auth";
export default async function Settings(){const doctor=await requireDoctor();return <section className="panel padded"><h1>Doctor Account Settings</h1><p>{doctor.email}</p><Link href="/doctor-dashboard/profile">Edit profile and contact details</Link><p>Sessions expire after eight hours. Logout revokes the current session immediately.</p><PasswordSettings kind="doctor"/><form method="post" action="/api/doctor-logout"><button className="button">Secure Logout</button></form></section>;}
