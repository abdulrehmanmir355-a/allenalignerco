import InfoPage from "../components/info-page";
import ResourceCenter, { Questions } from "../components/resource-center";
export const metadata = { title: "Resources" };
export default function Resources() {
  return <InfoPage eyebrow="Resource center" title="Find your next clear step." intro="Practical guides for your account, clinical records and everyday case workflow."><ResourceCenter/>
    <section className="guide-panel" id="uploads"><span className="eyebrow">CLINICAL RECORDS</span><h2>A smoother file handoff.</h2><div className="record-grid"><article><h3>Choose the right format</h3><p>The large uploader supports STL, PLY, OBJ, DCM (Part 10), PDF, JPG and PNG, up to 1 GB per file when private storage is enabled.</p></article><article><h3>Pick up where you left off</h3><p>Pause and resume a transfer. After a reload, select the original file to verify received chunks and upload the rest. Sessions last 24 hours.</p></article><article><h3>Keep versions in view</h3><p>A new upload with the same filename creates another version. Completed records appear on the case and in Documents.</p></article></div></section>
    <section className="faq-section"><span className="eyebrow">COMMON QUESTIONS</span><h2>A little clarity goes a long way.</h2><Questions/></section>
  </InfoPage>;
}
