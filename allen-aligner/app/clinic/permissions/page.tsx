import { currentClinic } from "../../lib/clinic-auth";
import { redirect } from "next/navigation";
import { requireDoctor } from "../../lib/portal-auth";
export default async function ClinicPermissions() {
  if(await currentClinic())redirect("/clinic/manage/users");
  await requireDoctor();
  return <main style={{ padding: "32px 5%", maxWidth: 1100, margin: "auto" }}><h1>Current access policy</h1><section className="panel padded"><ul><li>Verified doctors can register, search and update patients in their own clinic.</li><li>Patient change history is visible only to verified doctors in the same clinic.</li><li>Case details, files and treatment decisions remain restricted to the assigned doctor.</li><li>Laboratories require a case-specific, expiring access token.</li><li>Unverified, expired and revoked doctor sessions cannot access clinic records.</li></ul></section><p>Custom staff roles and permission editing are not enabled. This page describes the server-enforced policy.</p></main>;
}
