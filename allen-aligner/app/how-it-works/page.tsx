import InfoPage from "../components/info-page";
import WorkflowExplorer from "../components/workflow-explorer";
import { Questions } from "../components/resource-center";
import Link from "next/link";
export const metadata = { title: "How it works" };
export default function Workflow() {
  return <InfoPage eyebrow="How it works" title="A clear path through every case." intro="From professional registration to case follow-up, keep the information and decisions together.">
    <WorkflowExplorer/>
    <section className="editorial-split section"><div><span className="eyebrow">A DOCTOR-LED PROCESS</span><h2>Your review.<br/>Your next step.</h2><p>Written plan versions and review decisions remain connected to the case. Clinical decisions stay with qualified professionals.</p></div><div className="service-list"><article><span>01</span><div><h3>Prepare privately</h3><p>Collect records in a draft before submitting the case.</p></div></article><article><span>02</span><div><h3>Discuss in context</h3><p>Request adjustments and review the next written plan version.</p></div></article><article><span>03</span><div><h3>Follow the case</h3><p>Find messages, status changes and review history in one timeline.</p></div></article></div></section>
    <h2>Practical questions</h2><Questions compact/><div className="actions"><Link className="button" href="/doctor-register">Register your practice ↗</Link><Link className="text-link" href="/resources">More guides →</Link></div>
  </InfoPage>;
}
