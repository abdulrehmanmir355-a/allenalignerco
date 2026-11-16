import InfoPage from "../components/info-page";
import { Questions } from "../components/resource-center";
import Link from "next/link";
export const metadata = { title: "Contact and support" };
export default function Contact() {
  return <InfoPage eyebrow="Contact and support" title="The right place to start." intro="Find the next step for your account, a clinical case or your practice registration."><div className="resource-grid">
    <Link className="resource-card" href="/customer-service"><span className="eyebrow">MODULE 47</span><h3>Customer Service</h3><p>Create a private request, track its owner and priority, and follow the conversation through resolution.</p><span className="resource-open">Open service desk ↗</span></Link>
    <Link className="resource-card" href="/doctor-register"><span className="eyebrow">NEW TO ALLEN</span><h3>Register your practice</h3><p>Share your professional details to begin the verification process.</p><span className="resource-open">Start registration ↗</span></Link>
    <Link className="resource-card" href="/doctor-login"><span className="eyebrow">YOUR ACCOUNT</span><h3>Access your workspace</h3><p>Sign in with your verified doctor account. Pending registrations require review before access is enabled.</p><span className="resource-open">Doctor sign-in ↗</span></Link>
    <Link className="resource-card" href="/doctor-dashboard/cases"><span className="eyebrow">AN EXISTING CASE</span><h3>Continue the conversation</h3><p>Open the relevant case to send a message to its assigned laboratory.</p><span className="resource-open">Find your case ↗</span></Link>
  </div><section className="editorial-split section"><div><span className="eyebrow">GENERAL ENQUIRIES</span><h2>Let’s keep<br/>the route clear.</h2><p>Official phone, email and office details will appear here once confirmed. For now, the account and case routes above are available.</p></div><Questions compact/></section></InfoPage>;
}
