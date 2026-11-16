import InfoPage from '../components/info-page';
import Link from 'next/link';
export const metadata={title:"CTN information"};
export default function Page(){return <InfoPage eyebrow="CTN information" title="Clear information starts with confirmed details." intro="Confirmed CTN scope and supporting information will be published here."><section className="guide-panel" style={{marginTop:0}}><span className="eyebrow">IN PREPARATION</span><h2>Explore what is available today.</h2><p>Find the case workflow, practice registration and guides while this information is being prepared.</p><div className="actions"><Link className="button" href="/how-it-works">Explore the workflow ↗</Link><Link className="text-link" href="/resources">Browse resources →</Link></div></section></InfoPage>;}
