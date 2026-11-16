import "./home-layout.css";
import { activeWorkspace } from "./lib/active-workspace";
import Link from "next/link";
import WorkflowExplorer from "./components/workflow-explorer";
import PracticeShowcase from "./components/practice-showcase";
import CapabilitySlider from "./components/capability-slider";
import { Questions } from "./components/resource-center";

export default async function Home() {
  const doctor = await activeWorkspace();
  return <main className="professional-home">
    <section className="editorial-hero"><div className="allen-home-content editorial-hero-grid">
      <div className="hero-intro"><span className="eyebrow"><span className="dot"/> THE CONNECTED DENTAL PRACTICE</span><h1><span className="hero-title-line">Clearer cases.</span><span className="hero-title-line">Closer collaboration.</span><span className="hero-title-line"><em>Better connected.</em></span></h1><p className="lead">A focused workspace for dental professionals. Bring patient records, clinical files and laboratory conversations into one clear workflow.</p><div className="actions"><Link className="button" href={doctor ? doctor : "/doctor-register"}>{doctor ? "Your Dashboard" : "Register your practice"} <span aria-hidden="true">↗</span></Link><Link className="text-link" href="/how-it-works">Explore the workflow <span aria-hidden="true">→</span></Link></div><div className="hero-assurance"><span>Doctor-led decisions</span><span>Private case records</span><span>A considered workflow</span></div></div>
      <div className="clinical-composition" aria-label="A visual overview of the Allen case workflow">
        <div className="composition-heading"><span className="eyebrow">THE ALLEN WORKFLOW</span><span className="composition-index">01 / 04</span></div>
        <div className="clinical-arch" aria-hidden="true"><svg viewBox="0 0 400 300" fill="none"><path d="M104 70C62 148 81 252 200 258C319 252 338 148 296 70" stroke="currentColor" strokeWidth="44" strokeLinecap="round" opacity=".09"/><path d="M104 70C62 148 81 252 200 258C319 252 338 148 296 70" stroke="currentColor" strokeWidth="1.2"/><path d="M125 78C94 144 104 225 200 231C296 225 306 144 275 78" stroke="currentColor" strokeWidth="1" opacity=".5"/>{[0,1,2,3,4].map(i=><ellipse key={i} cx="200" cy="158" rx={62+i*21} ry={40+i*20} stroke="currentColor" opacity={0.05+i*.02}/>)}</svg><span>DIGITAL DENTISTRY<br/><strong>with a clear direction.</strong></span></div>
        <div className="composition-route"><div><span>01</span><strong>Prepare</strong><small>Records in one place</small></div><div><span>02</span><strong>Collaborate</strong><small>A shared case conversation</small></div><div><span>03</span><strong>Review</strong><small>Your decision, recorded</small></div></div>
        <div className="composition-footer"><span>A workflow illustration</span><Link href="/how-it-works" aria-label="Explore the Allen workflow">Explore <span aria-hidden="true">↗</span></Link></div>
      </div>
    </div></section>
    <div className="capability-strip"><div className="allen-home-content"><CapabilitySlider/></div></div>
    <section className="section allen-home-content"><div className="section-heading"><div><span className="eyebrow">DESIGNED FOR EVERYDAY PRACTICE</span><h2>Less searching.<br/>More perspective.</h2></div><p>The right information, brought together around the case. Move between records, review decisions and conversations with a clear next step.</p></div><PracticeShowcase/></section>
    <section className="workflow-section"><div className="allen-home-content"><div className="section-heading"><div><span className="eyebrow">FROM FIRST RECORD TO NEXT STEP</span><h2>One case.<br/>A connected journey.</h2></div><p>Select a step to see how the workspace supports your practice.</p></div><WorkflowExplorer/></div></section>
    <section className="section allen-home-content editorial-split"><div><span className="eyebrow">BEFORE YOU BEGIN</span><h2>A few useful answers.</h2><p>Practical details for getting your practice started.</p><Link className="text-link" href="/resources">Visit the resource center ↗</Link></div><Questions compact/></section>
    <section className="section allen-home-content"><div className="cta-panel"><div><span className="eyebrow">FOR DENTAL PROFESSIONALS</span><h2>Make room for<br/>a clearer workflow.</h2><p>Start with your professional registration.</p></div><div className="cta-actions"><Link className="button light" href={doctor ? doctor : "/doctor-register"}>{doctor ? "Your Dashboard" : "Register your practice ↗"}</Link>{!doctor && <Link href="/doctor-login">Already registered? Sign in →</Link>}</div></div></section>
  </main>;
}
