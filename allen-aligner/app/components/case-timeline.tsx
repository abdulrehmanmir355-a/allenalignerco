import type { caseTimeline } from '../lib/case-timeline';
import { lifecycleStages, pendingLifecycle } from '../lib/case-lifecycle';
import CaseLifecycleTracker from './case-lifecycle-tracker';

export default function CaseTimeline({ timeline }: { timeline: Awaited<ReturnType<typeof caseTimeline>> }) {
  return <section className="panel padded">
    <div className="section-heading"><h2>Case timeline</h2><span className="badge">{timeline.entries.length} activities</span></div>
    <p>Current status: <strong>{timeline.case.status.replaceAll('_', ' ')}</strong>. Oldest first; timestamps are stored server times in UTC. Ties use a stable record key, not an inferred sequence.</p>
    {timeline.case.workflow && <p>QC: <strong>{timeline.case.workflow.qcState.replaceAll('_',' ')}</strong> · Treatment: <strong>{timeline.case.workflow.careStage.replaceAll('_',' ')}</strong></p>}
    {timeline.visibility === 'activity_metadata' && <p>Clinic activity metadata only. Clinical notes, conversations, plans and file details remain in the assigned doctor’s portal.</p>}
    <CaseLifecycleTracker status={timeline.case.status} workflow={timeline.case.workflow}/>
    <ol className="portal-timeline">{timeline.entries.map(entry => <li className="timeline-entry" key={entry.id}>
      <div className="timeline-entry-header"><span className="badge">{entry.category}</span> <time dateTime={entry.at}>{entry.at.replace('T', ' ').replace('Z', ' UTC')}</time></div>
      <strong>{entry.title}</strong>
      <p>Actor: {entry.actor ? `${entry.actor.name} · ${entry.actor.role}` : 'Not recorded'} · Action: {entry.action}
        {entry.status && <> · Status: {entry.fromStatus ? `${entry.fromStatus} → ` : ''}{entry.status}</>}</p>
      {entry.workflow && <p>QC: {entry.workflow.qcState} · Treatment: {entry.workflow.careStage}</p>}
      {entry.notes && <p className="preserve-lines">{entry.notes}</p>}
    </li>)}</ol>
    <details><summary>Lifecycle coverage</summary><ul>{lifecycleStages.map(stage => <li key={stage.label}><strong>{stage.label}</strong>: {stage.statuses.join(' / ')}. {stage.detail}</li>)}</ul><p>{pendingLifecycle}</p><p>Historical actor and status details are shown only when recorded; current case status is not applied to old events.</p></details>
  </section>;
}
