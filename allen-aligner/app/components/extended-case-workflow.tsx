import PortalForm from './portal-form';
import type { doctorWorkflowView } from '../lib/extended-case-workflow';
import type { WorkflowAction } from '../lib/extended-workflow-policy';
const labels: Partial<Record<WorkflowAction,string>> = {
  enable: 'Enroll this existing case', start_treatment: 'Confirm receipt and start treatment', progress: 'Record treatment progress',
  request_refinement: 'Request a new refinement plan', resume_treatment: 'Confirm refinement receipt and resume treatment',
  complete_treatment: 'Confirm treatment completion', start_retention: 'Start retention', retention_review: 'Record retention review', complete_retention: 'Complete retention follow-up', close_case: 'Close this case',
};
export default function ExtendedCaseWorkflow({ state }: { state: Awaited<ReturnType<typeof doctorWorkflowView>> }) {
  if (!state) return null;
  return <section className="panel padded case-lifecycle-actions"><span className="eyebrow">MODULE 07 · COMPLETE CASE LIFECYCLE</span><h2>Case lifecycle actions</h2>
    <p>QC: <strong>{state.qcState?.replaceAll('_',' ') || 'Not enrolled'}</strong> · Treatment / retention: <strong>{state.careStage?.replaceAll('_',' ') || 'Not enrolled'}</strong></p>
    {state.caseClosedAt && <p className="notice" role="status">Case closed on {new Date(state.caseClosedAt).toLocaleDateString()}. The lifecycle record is read-only.</p>}
    {state.qcState === 'NOT_RECORDED' && <p>QC evidence was not recorded for this previously dispatched case. Enrollment does not certify past QC.</p>}
    {!state.careStage && <p>Existing history will be preserved. Enrollment starts tracking future actions and does not reconstruct earlier clinical milestones.</p>}
    {state.careStage === 'REFINEMENT' && <p>Attach required updated records below. The laboratory must create a new plan version, followed by internal clinical review, your approval, manufacture, QC and dispatch before treatment resumes.</p>}
    {state.careStage === 'RETENTION_COMPLETED' && !state.caseClosureEnabled && <p>Retention follow-up is complete. Case closure is ready once the closure database update is applied.</p>}
    {state.actions.filter(a=>labels[a]).map(action=><details key={action}><summary>{labels[action]}</summary>
      <PortalForm action={`/api/portal/cases/${state.caseId}/workflow`} label={labels[action]}>
        <input type="hidden" name="action" value={action}/><input type="hidden" name="revision" value={state.revision}/>
        <label>{action==='start_retention'?'Retention plan and follow-up notes':'Clinical notes / reason'}<textarea name="notes" minLength={5} maxLength={4000} rows={4} required/></label>
        <label className="checkbox"><input name="confirmed" value="yes" type="checkbox" required/>I confirm that this action accurately records my clinical review.</label>
      </PortalForm>
    </details>)}
    {state.actions.length === 0 && <p>No treatment action is available at the current stage.</p>}
  </section>;
}
