import { caseTimeline, timelineViewer } from '../../../../../lib/case-timeline';
import { failure } from '../../../../../lib/portal-http';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await timelineViewer('clinic');
    return Response.json(await caseTimeline((await params).id, viewer), { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
  } catch (e) { return failure(e); }
}
