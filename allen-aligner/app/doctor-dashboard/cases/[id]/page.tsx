import ExtendedCaseWorkflow from '../../../components/extended-case-workflow';
import PlanReviewOpened from '../../../components/plan-review-opened';
import { doctorWorkflowView } from '../../../lib/extended-case-workflow';
import CaseTimeline from '../../../components/case-timeline';
import { caseTimeline } from '../../../lib/case-timeline';
import Link from "next/link";
import { releasedPlanIds } from "../../../lib/clinical-service";
import { notFound } from "next/navigation";

import PortalForm from "../../../components/portal-form";
import ClinicalFileUpload from "../../../components/clinical-file-upload";
import LargeClinicalUpload from "../../../components/large-clinical-upload";

import {
  requireDoctor,
  ownCases,
} from "../../../lib/portal-auth";

import { db } from "../../../lib/database";

export default async function CaseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Secure doctor authentication
  const doctor = await requireDoctor();
  const { id } = await params;

  // Load only cases owned by this doctor and clinic
  const c = await db.portalCase.findFirst({
    where: {
      id,
      ...ownCases(doctor),
    },
    include: {
      events: {
        orderBy: { createdAt: "desc" },
      },
      files: {
        select: {
          id: true,
          name: true,
          size: true,
          createdAt: true,
        },
      },
      plans: {
        orderBy: { version: "desc" },
      },
      messages: {
        orderBy: { createdAt: "asc" },
      },
      labAccess: {
        select: {
          label: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!c) {
    notFound();
  }

  const released = await releasedPlanIds([id]);
  c.plans = c.plans.filter(p => released.has(p.id));
  const versionIds = c.plans.map(p => p.id);
  const [versionFiles, versionAudit, reviewVersions] = versionIds.length ? await Promise.all([
    db.query(`SELECT f."planId",f."caseFileId",cf.name AS "standardName",f."largeFileId",lf."originalName" AS "largeName" FROM "TreatmentPlanFile" f LEFT JOIN "CaseFile" cf ON cf.id=f."caseFileId" LEFT JOIN "LargeClinicalFile" lf ON lf.id=f."largeFileId" WHERE f."planId"=ANY($1::text[]) ORDER BY f.id`, [versionIds]),
    db.query(`SELECT id::text,"planId","actorName","actorRole",action,detail,"createdAt" FROM "TreatmentPlanVersionAudit" WHERE "caseId"=$1 ORDER BY id`, [id]),
    db.query(`SELECT p.id AS "planId",r.status::text AS "reviewStatus",r."independenceVerified" FROM "TreatmentPlan" p JOIN "ClinicalReview" r ON r."planId"=p.id WHERE p.id=ANY($1::text[])`, [versionIds])
  ]) : [[], [], []];
  const latest = c.plans[0];
  const [clinic] = await db.query('SELECT name FROM "Clinic" WHERE id=$1', [doctor.clinicId]);
  const [currentPlan] = await db.query('SELECT id FROM "TreatmentPlan" WHERE "caseId"=$1 ORDER BY version DESC LIMIT 1', [id]);
  const submissions = await db.query(`SELECT p.id,r."completedAt" FROM "TreatmentPlan" p JOIN "ClinicalReview" r ON r."planId"=p.id WHERE p."caseId"=$1 AND r.status='APPROVED'`,[id]);
  const action = `/api/portal/cases/${id}`;

  const canUpload = [
    "DRAFT",
    "CHANGES_REQUESTED",
  ].includes(c.status);

  const uploadsEnabled =
    process.env.ENABLE_PRIVATE_UPLOADS === "true";

  const timeline = await caseTimeline(id, { kind: 'doctor', id: doctor.id, clinicId: doctor.clinicId! });
  const workflow = await doctorWorkflowView(id,doctor);

  return (
    <>
      {/* CASE HEADER */}

      <Link
        className="breadcrumb"
        href="/doctor-dashboard/cases"
      >
        ← All cases
      </Link>

      <Link className="text-link" href={`/doctor-dashboard/support?case=${encodeURIComponent(id)}`}>Get help with this case ↗</Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            PRIVATE CASE · {c.id}
          </span>

          <h1>{c.patientReference}</h1>

          <p>
            {c.category} ·{" "}
            {c.createdAt.toISOString().slice(0, 10)}
          </p>
        </div>

        <span className="badge">
          {c.status.replaceAll("_", " ")}
        </span>
      </div>

      <div className="dashboard-grid">

        {/* CASE NOTES AND MEMO */}

        <section className="panel padded">
          <span className="eyebrow">
            CLINICAL INFORMATION
          </span>

          <h2>Case notes / memo</h2>

          <p className="preserve-lines">
            {c.notes || "No notes supplied."}
          </p>

          <p className="fine-print">
            Sharing authorization recorded{" "}
            {c.consentAt.toISOString().slice(0, 10)}.
          </p>

          <p>
            Laboratory:{" "}
            {c.labAccess &&
            c.labAccess.expiresAt > new Date()
              ? c.labAccess.label
              : "Awaiting assignment by Allen operations"}
          </p>

          {c.status === "DRAFT" && (
            <PortalForm
              action={action}
              label="Submit case to lab"
            >
              <input
                type="hidden"
                name="action"
                value="submit"
              />
              <input type="hidden" name="revision" value={c.revision}/>

              <p>
                Attach at least one clinical record.
                Submission locks the initial records
                for laboratory review.
              </p>
            </PortalForm>
          )}
        </section>

        <div id="case-timeline"><CaseTimeline timeline={timeline}/></div>
      </div>

      <ExtendedCaseWorkflow state={workflow}/>

      {/* PRIVATE CLINICAL FILE MANAGEMENT */}

      <section className="panel padded">
        <span className="eyebrow">
          SECURE FILE MANAGEMENT
        </span>

        <h2>Private clinical records</h2>

        <p>
          Downloads require your authenticated
          account. Files are never published
          to the website.
        </p>

        {c.files.length > 0 ? (
          <ul>
            {c.files.map((file) => (
              <li key={file.id}>
                <a
                  href={`/api/portal/files/${file.id}`}
                >
                  {file.name}
                </a>
                {" · "}
                {Math.ceil(file.size / 1024)} KB
              </li>
            ))}
          </ul>
        ) : (
          <p>No standard clinical records attached.</p>
        )}

        {/* LARGE FILE UPLOAD */}

        <LargeClinicalUpload
          action={`${action}/large-uploads`}
          canUpload={canUpload && uploadsEnabled}
        />

        {/* STANDARD CLINICAL FILE UPLOAD */}

        {canUpload &&
          (uploadsEnabled ? (
            <ClinicalFileUpload
              action={`${action}/files`}
            />
          ) : (
            <div className="notice">
              File intake is disabled pending
              private storage configuration.
            </div>
          ))}
      </section>

      {/* TREATMENT PLAN REVIEW */}

      <section className="panel padded" id="plan-versions">
        <span className="eyebrow">
          CLINICAL PLANNING
        </span>

        <h2>Treatment plan review</h2>
        <p>Assigned doctor: {doctor.fullName} · Clinic: {String(clinic?.name || 'Unavailable')}</p>
        <p><a href="#plan-versions">View Previous Versions</a> · <a href="#case-timeline">View Case Timeline</a></p>
        <div className="notice">3D treatment viewer is unavailable. Use the authorized files bound to each version below. Structured stages, upper/lower arch, IPR and attachment details are not recorded here; consult the supplied plan documents.</div>
        {latest && currentPlan && latest.id===currentPlan.id && <PlanReviewOpened action={action} planId={latest.id}/>}

        

        {!latest && (
          <p>
            Waiting for the assigned laboratory
            to publish a plan summary.
          </p>
        )}

        {latest && c.status==='REVIEW' && !reviewVersions.some(r=>r.planId===latest.id && r.independenceVerified) && <p className="notice">A verified independent clinical review is required before your decision on this version. Allen must confirm the preparer and a separate qualified reviewer.</p>}
        {c.plans.length > 1 && <details className="plan-version"><summary>Compare latest released version v{c.plans[0].version} with v{c.plans[1].version}</summary><div className="record-grid"><article><h3>Version {c.plans[1].version}</h3><p><strong>Change summary</strong></p><p className="preserve-lines">{c.plans[1].changeSummary||"No change summary recorded for this legacy version."}</p><p><strong>Plan</strong></p><p className="preserve-lines">{c.plans[1].summary}</p></article><article><h3>Version {c.plans[0].version}</h3><p><strong>Change summary</strong></p><p className="preserve-lines">{c.plans[0].changeSummary||"No change summary recorded for this legacy version."}</p><p><strong>Plan</strong></p><p className="preserve-lines">{c.plans[0].summary}</p></article></div></details>}
        {c.plans.map((plan) => (
          <article
            className="plan-version"
            key={plan.id}
          >
            <span className="badge">
              Version {plan.version} ·{" "}
              {String(versionAudit.find(e=>e.planId===plan.id && e.detail?.decision)?.detail.decision || plan.decision).replaceAll("_", " ")}
            </span>

            <p className="preserve-lines">
              {plan.summary}
            </p>
            <p><strong>Change summary:</strong> {plan.changeSummary||"No change summary recorded for this legacy version."}</p>
            <p>Author: {plan.authorName||"Not recorded"} · {plan.createdByRole||"Legacy version"}{plan.parentPlanId?" · based on an earlier version":""}</p>
            <p>Internal review: {reviewVersions.find(r=>r.planId===plan.id)?.reviewStatus||"Not recorded"}</p>
            {versionAudit.filter(e=>e.planId===plan.id && e.detail?.decision).map(e=><div className="notice" key={e.id}><p>Decision record {e.id} · {e.actorName} · {e.createdAt.toISOString()} · {e.detail.decision}</p><p className="preserve-lines">{e.detail.comments || 'No decision comments supplied.'}</p><p className="fine-print" style={{overflowWrap:'anywhere'}}>Artifact SHA-256: {e.detail.artifactSha256}</p></div>)}
            <p>Prepared: {plan.createdAt.toISOString().replace('T',' ').slice(0,16)} UTC · Submitted to doctor: {submissions.find(r=>r.id===plan.id)?.completedAt?.toISOString().replace('T',' ').slice(0,16)||'Not recorded'} UTC</p>
            {plan.decision==="APPROVED"&&<p>Approved version {plan.version} · {plan.approvedAt?.toISOString().replace("T"," ").slice(0,16)||plan.reviewedAt?.toISOString().replace("T"," ").slice(0,16)||"time unavailable"} · doctor ID {plan.approvedByDoctorId||"not recorded"}</p>}
            <h4>Files bound to v{plan.version}</h4><ul>{versionFiles.filter(f=>f.planId===plan.id).map(f=>{const fileId=String(f.caseFileId||f.largeFileId);const name=String(f.standardName||f.largeName||"Case file");const href=f.caseFileId?`/api/portal/files/${encodeURIComponent(fileId)}`:`/api/portal/cases/${encodeURIComponent(id)}/large-uploads/files/${encodeURIComponent(fileId)}`;return <li key={`${plan.id}:${fileId}`}><a href={href}>{name}</a></li>;})}</ul>
            <details><summary>Version audit events</summary>{versionAudit.filter(e=>e.planId===plan.id).map(e=><p key={e.id}>{e.action.replaceAll("_"," ")} · {e.actorName} ({e.actorRole}) · {e.createdAt.toISOString().replace("T"," ").slice(0,16)}</p>)}</details>
            <small>
              Published{" "}
              {plan.createdAt
                .toISOString()
                .slice(0, 10)}

              {plan.reviewedAt
                ? ` · Reviewed ${plan.reviewedAt
                    .toISOString()
                    .slice(0, 10)}`
                : ""}
            </small>
          </article>
        ))}

        {latest &&
          latest.id === currentPlan?.id &&
          c.status === "REVIEW" &&
          latest.decision === "PENDING" && reviewVersions.some(r=>r.planId===latest.id && r.independenceVerified) && (
            <div className="record-grid">

              <PortalForm
                action={action}
                label={`Approve Treatment Plan · version ${latest.version}`}
              >
                <input
                  type="hidden"
                  name="action"
                  value="approve"
                />
                <input type="hidden" name="revision" value={c.revision}/>

                <input
                  type="hidden"
                  name="planId"
                  value={latest.id}
                />

                <label className="checkbox">
                  <input
                    type="checkbox"
                    name="confirmed"
                    value="yes"
                    required
                  />
                  I have reviewed the supplied
                  plan and confirm approval.
                </label>
              </PortalForm>

              <PortalForm
                action={action}
                label="Request Modifications"
              >
                <input
                  type="hidden"
                  name="action"
                  value="adjustment"
                />
                <input type="hidden" name="revision" value={c.revision}/>

                <input
                  type="hidden"
                  name="planId"
                  value={latest.id}
                />

                <label>
                  Changes requested

                  <textarea
                    name="text"
                    required
                    maxLength={5000}
                    rows={4}
                  />
                </label>
              </PortalForm>
              <PortalForm action={action} label="Reject Treatment Plan">
                <input type="hidden" name="action" value="reject"/>
                <input type="hidden" name="revision" value={c.revision}/>
                <input type="hidden" name="planId" value={latest.id}/>
                <label>Reason for rejection<textarea name="text" required minLength={5} maxLength={5000} rows={4}/></label>
                <p>Rejects this version, blocks manufacturing and returns the case to planning. A new version requires fresh internal and doctor review.</p>
              </PortalForm>
            </div>
          )}
      </section>

      <section className="panel padded" id="case-communication">
        <span className="eyebrow">CASE COMMUNICATION</span>
        <h2>Doctor–Allen communication</h2>
        <p>A dedicated conversation with the Allen internal team for this case. Questions, replies and documents stay in the case history.</p>
        {c.status==='DRAFT'?<p>Submit this case to start its shared conversation.</p>:<Link className="button" href={`/doctor-dashboard/cases/${encodeURIComponent(id)}/communication`}>Open case conversation →</Link>}
      </section>
    </>
  );
}
