import { activeWorkspace } from "../lib/active-workspace";
import InfoPage from "../components/info-page";
import { Questions } from "../components/resource-center";
import Link from "next/link";
export const metadata = { title: "For doctors" };
export default async function Doctors() {
 const doctor = await activeWorkspace();
  return <InfoPage eyebrow="For dental professionals" title="Your practice. A clearer perspective." intro="Organize records, collaborate with the laboratory and keep the next case decision in view."><div className="resource-grid">{[
    ["PATIENT RECORDS","An organized starting point","Find patient references and clinical information in your private practice workspace.","/doctor-dashboard/patients"],
    ["CASE MANAGEMENT","A journey you can follow","Prepare a draft, upload clinical records and follow case status and conversations.","/doctor-dashboard/cases"],
    ["DOCTOR REVIEW","Your decision, in context","Read proposed written plans, compare versions and approve or request an adjustment.","/doctor-dashboard/plans"]
  ].map(([tag,title,text,href])=><Link className="resource-card" href={href} key={title}><span className="eyebrow">{tag}</span><h3>{title}</h3><p>{text}</p><span className="resource-open">Open workspace ↗</span></Link>)}</div><section id="registration" className="editorial-split section"><div><span className="eyebrow">BEFORE YOU BEGIN</span><h2>A considered start.</h2><p>Have your professional registration number and practice details ready. Account verification is required before accessing patient records.</p><div className="actions">{doctor ? <Link className="button" href="/doctor-dashboard">Doctor Dashboard</Link> : <><Link className="button" href="/doctor-register">Register your practice ↗</Link><Link className="text-link" href="/doctor-login">Sign in →</Link></>}</div></div><Questions compact/></section></InfoPage>;
}
