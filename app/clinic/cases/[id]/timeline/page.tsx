import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { caseTimeline, timelineViewer } from '../../../../lib/case-timeline';
import { PortalError } from '../../../../lib/portal-http';
import CaseTimeline from '../../../../components/case-timeline';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  let timeline: Awaited<ReturnType<typeof caseTimeline>> | null = null;
  try {
    const viewer = await timelineViewer('clinic');
    timeline = await caseTimeline((await params).id, viewer);
  } catch (e) {
    if (e instanceof PortalError) {
      if (e.status === 401) redirect('/clinic-login');
      if (e.status === 404) notFound();
      if (e.status !== 403) throw e;
    }
    else throw e;
  }
  if (!timeline) return <main className="container section"><h1>Access restricted</h1><p>Patient access permission is required to view case activity.</p></main>;
    return <main className="container section"><Link href="/clinic/manage/cases">← Clinic cases</Link><h1>{timeline.case.patientReference}</h1><CaseTimeline timeline={timeline}/></main>;
}
