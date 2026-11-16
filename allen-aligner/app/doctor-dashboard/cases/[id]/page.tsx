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
import PlanFilesViewer from "../../../components/plan-files-viewer";

import {
  requireDoctor,
  ownCases,
} from "../../../lib/portal-auth";

import { db } from "../../../lib/database";
import { decodeCaseIntake, decodeRecordFilename } from "../../../lib/case-intake";

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
  const caseIntake = decodeCaseIntake(c.notes);
  const sourceScanFiles = c.files
    .map(file => ({ ...file, decoded: decodeRecordFilename(file.name) }))
    .filter(file => file.decoded.recordType === 'scan' && /\.(stl|ply|obj|glb|gltf|3mf|wrl|vrml|dae|fbx|off)$/i.test(file.decoded.filename));
  const sourceLargeFiles = await db.largeClinicalFile.findMany({
    where: { caseId: id, uploadedByRole: 'DOCTOR' },
    select: { id: true, originalName: true, sizeBytes: true, version: true, uploadedByLabel: true },
    orderBy: { createdAt: 'desc' },
  });
  const largeSourceScans = sourceLargeFiles
    .map(file => ({ ...file, decoded: decodeRecordFilename(file.originalName) }))
    .filter(file => file.decoded.recordType === 'scan' && /\.(stl|ply|obj|glb|gltf|3mf|wrl|vrml|dae|fbx|off)$/i.test(file.decoded.filename));

  const released = await releasedPlanIds([id]);
  c.plans = c.plans.filter(p => released.has(p.id));
  const versionIds = c.plans.map(p => p.id);
  const [versionFiles, versionAudit, reviewVersions] = versionIds.length ? await Promise.all([
    db.query(`SELECT f."planId",f."caseFileId",cf.name AS "standardName",f."largeFileId",lf."originalName" AS "largeName" FROM "TreatmentPlanFile" f LEFT JOIN "CaseFile" cf ON cf.id=f."caseFileId" LEFT JOIN "LargeClinicalFile" lf ON lf.id=f."largeFileId" WHERE f."planId"=ANY($1::text[]) ORDER BY f.id`, [versionIds]),
    db.query(`SELECT id::text,"planId","actorId"::text AS "actorId","actorName","actorRole",action,detail,"createdAt" FROM "TreatmentPlanVersionAudit" WHERE "caseId"=$1 ORDER BY id`, [id]),
    db.query(`SELECT p.id AS "planId",r.status::text AS "reviewStatus",r."independenceVerified" FROM "TreatmentPlan" p JOIN "ClinicalReview" r ON r."planId"=p.id WHERE p.id=ANY($1::text[])`, [versionIds])
  ]) : [[], [], []];
  const latest = c.plans[0];
  const [clinic] = await db.query('SELECT name FROM "Clinic" WHERE id=$1', [doctor.clinicId]);
  const [currentPlan] = await db.query('SELECT id,version,decision FROM "TreatmentPlan" WHERE "caseId"=$1 ORDER BY version DESC LIMIT 1', [id]);
  const [manufacturingSetup] = await db.query(`SELECT to_regclass('public."ManufacturingOrder"') IS NOT NULL AND to_regclass('public."ManufacturingStageRecord"') IS NOT NULL AND to_regclass('public."ManufacturingQualityReview"') IS NOT NULL AND to_regclass('public."ProductionQCInspection"') IS NOT NULL AS ready`);
  const [manufacturingOrder] = manufacturingSetup?.ready === true && currentPlan?.id
    ? await db.query(`SELECT mo."orderNumber",mo."planVersion",mo.status,mo."approvedAt",mo."queuePosition",mo."dueDate"::text AS "dueDate",mo."materialCheckedAt",mo."commercialCheckedAt",mo."capacityCheckedAt",mo."costedAt",c.status AS "caseStatus",
          (SELECT count(*)::int FROM "ManufacturingStageRecord" s WHERE s."orderId"=mo.id) AS "stageCount",
          (SELECT s.result FROM "ManufacturingStageRecord" s WHERE s."orderId"=mo.id ORDER BY s.sequence DESC LIMIT 1) AS "latestStageResult",
          (SELECT q.decision FROM "ManufacturingQualityReview" q WHERE q."orderId"=mo.id ORDER BY q."createdAt" DESC,q.id DESC LIMIT 1) AS "latestQualityDecision",
          (SELECT q.disposition FROM "ProductionQCInspection" q WHERE q."caseId"=mo."caseId" AND q."planId"=mo."planId" AND q.stage='FINAL' ORDER BY q."createdAt" DESC,q.id DESC LIMIT 1) AS "latestFinalQcDisposition",
          (SELECT q.inspector FROM "ProductionQCInspection" q WHERE q."caseId"=mo."caseId" AND q."planId"=mo."planId" AND q.stage='FINAL' ORDER BY q."createdAt" DESC,q.id DESC LIMIT 1) AS "latestFinalQcInspector",
          (SELECT q."createdAt"::text FROM "ProductionQCInspection" q WHERE q."caseId"=mo."caseId" AND q."planId"=mo."planId" AND q.stage='FINAL' ORDER BY q."createdAt" DESC,q.id DESC LIMIT 1) AS "latestFinalQcAt",
          (SELECT q.disposition FROM "ProductionQCInspection" q WHERE q."caseId"=mo."caseId" AND q."planId"=mo."planId" AND q.stage='INCOMING' ORDER BY q."createdAt" DESC,q.id DESC LIMIT 1) AS "latestIncomingQcDisposition",
          (SELECT q.disposition FROM "ProductionQCInspection" q WHERE q."caseId"=mo."caseId" AND q."planId"=mo."planId" AND q.stage='IN_PROCESS' ORDER BY q."createdAt" DESC,q.id DESC LIMIT 1) AS "latestInProcessQcDisposition"
        FROM "ManufacturingOrder" mo JOIN "TreatmentPlan" p ON p.id=mo."planId" JOIN "PortalCase" c ON c.id=mo."caseId"
        WHERE mo."planId"=$1 AND mo."caseId"=$2 AND mo."approvedDoctorId"=$3 AND p."approvedByDoctorId"=$3 AND mo."planVersion"=p.version
        LIMIT 1`, [currentPlan.id,id,doctor.id])
    : [];
  const manufacturingModule17Label = manufacturingOrder ? ({
    MATERIAL_CHECK: 'Waiting for material check',
    COMMERCIAL_CHECK: 'Materials reserved · waiting for commercial check',
    CAPACITY_CHECK: 'Commercial check passed · waiting for capacity and due date',
    QUEUED: manufacturingOrder.costedAt
      ? `${Number(manufacturingOrder.stageCount)} production stage${Number(manufacturingOrder.stageCount)===1?'':'s'} recorded · costing complete`
      : Number(manufacturingOrder.stageCount)>0
        ? `${Number(manufacturingOrder.stageCount)} production stage${Number(manufacturingOrder.stageCount)===1?'':'s'} recorded · costing pending`
        : 'In production queue · stages and costing pending',
    QUALITY_HOLD: 'Quality hold · rework action required',
    RELEASED: 'Production complete · final quality passed',
    SUPERSEDED: 'Replaced by a newer plan version',
  } as Record<string,string>)[String(manufacturingOrder.status)] ?? String(manufacturingOrder.status).replaceAll('_',' ') : null;
  const manufacturingModule18Label = manufacturingOrder ? (manufacturingOrder.latestFinalQcDisposition==='PASS'
    ? `${manufacturingOrder.status==='RELEASED'?'Released':'QC passed · MES release pending'}${manufacturingOrder.latestFinalQcInspector?` · inspected by ${manufacturingOrder.latestFinalQcInspector}`:''}${manufacturingOrder.latestFinalQcAt?` · ${new Date(manufacturingOrder.latestFinalQcAt).toISOString().slice(0,16).replace('T',' ')} UTC`:''}`
    : ['REWORK','HOLD','REJECT'].includes(String(manufacturingOrder.latestFinalQcDisposition))
      ? `Final QC ${String(manufacturingOrder.latestFinalQcDisposition).toLowerCase()} · action required`
      : manufacturingOrder.status==='QUALITY_HOLD'
        ? 'MES quality hold · verify current Final QC disposition'
        : 'Waiting for current-plan Final QC after production and costing') : null;
  const module19DispatchReady = Boolean(manufacturingOrder&&manufacturingOrder.status==='RELEASED'&&manufacturingOrder.latestIncomingQcDisposition==='PASS'&&manufacturingOrder.latestInProcessQcDisposition==='PASS'&&manufacturingOrder.latestFinalQcDisposition==='PASS');
  const module19Label = ['SHIPPED','COMPLETED'].includes(c.status)
    ? `Dispatched · case status ${c.status.replaceAll('_',' ').toLowerCase()}`
    : module19DispatchReady
      ? 'All current-plan QC passes recorded · ready for dispatch'
      : 'Waiting for production release and current-plan Incoming, In-Process and Final QC passes';
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
  const planningSources = [
    ...sourceScanFiles.map(file => ({ id: file.id, name: file.decoded.filename, size: file.size, href: `/api/portal/files/${encodeURIComponent(file.id)}`, previewHref: /\.(stl|ply|obj|glb)$/i.test(file.decoded.filename) ? `/api/portal/files/${encodeURIComponent(file.id)}?preview=1` : undefined })),
    ...largeSourceScans.map(file => ({ id: file.id, name: file.decoded.filename, size: file.sizeBytes, href: `/api/portal/cases/${encodeURIComponent(id)}/large-uploads/files/${encodeURIComponent(file.id)}`, previewHref: /\.(stl|ply|obj|glb)$/i.test(file.decoded.filename) ? `/api/portal/cases/${encodeURIComponent(id)}/large-uploads/files/${encodeURIComponent(file.id)}?preview=1` : undefined })),
  ];

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

      {manufacturingSetup?.ready===true&&<section className="panel padded" aria-labelledby="manufacturing-handoff-heading" style={{margin:'18px 0',borderColor:'#9dcfd2',background:'linear-gradient(135deg,#f2faf9,#fff 62%,#f1f6ff)'}}>
        <span className="eyebrow">CONNECTED WORKFLOW · MODULES 15 → 20</span>
        <h2 id="manufacturing-handoff-heading">Doctor approval through treatment handoff</h2>
        <p>{manufacturingOrder?<>Approved plan v{manufacturingOrder.planVersion} is linked to manufacturing order <strong>{manufacturingOrder.orderNumber}</strong>. Each card reflects the current case, order and QC records.</>:currentPlan?<>Current plan v{currentPlan.version} · {String(currentPlan.decision).replaceAll('_',' ').toLowerCase()}. The cards show which stages are waiting for doctor approval.</>:<>No treatment plan exists for this case yet. The six cards will update as the case moves through approval, manufacturing, QC, dispatch and treatment.</>}</p>
        <div className="module-flow-grid" role="list" aria-label="Live manufacturing workflow status" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,205px),1fr))',gap:12,margin:'18px 0'}}>
          {[
            {title:'Module 15 · Doctor approval',state:manufacturingOrder?'Complete':currentPlan?.decision==='APPROVED'?'Complete':currentPlan?'Waiting':'Waiting',detail:manufacturingOrder?`Plan v${manufacturingOrder.planVersion} approved · ${new Date(manufacturingOrder.approvedAt).toISOString().slice(0,16).replace('T',' ')} UTC`:currentPlan?`Plan v${currentPlan.version} · awaiting exact-version doctor approval.`:'Waiting for a treatment plan.'},
            {title:'Module 16 · Automatic trigger',state:manufacturingOrder?manufacturingOrder.status==='SUPERSEDED'?'Superseded':'Complete':currentPlan?.decision==='APPROVED'?'Action needed':'Waiting',detail:manufacturingOrder?`Order ${manufacturingOrder.orderNumber} was generated from the approved plan.`:currentPlan?.decision==='APPROVED'?'Doctor approval exists, but no matching manufacturing order is visible.':'Creates the manufacturing order immediately after approval.'},
            {title:'Module 17 · Production control',state:!manufacturingOrder?'Waiting':manufacturingOrder.status==='RELEASED'?'Complete':manufacturingOrder.status==='SUPERSEDED'?'Superseded':manufacturingOrder.status==='QUALITY_HOLD'?'Action needed':'In progress',detail:manufacturingModule17Label??'Begins when Module 16 creates the order.'},
            {title:'Module 18 · Final quality',state:!manufacturingOrder?'Waiting':manufacturingOrder.latestFinalQcDisposition==='PASS'&&manufacturingOrder.status==='RELEASED'?'Complete':['REWORK','HOLD','REJECT'].includes(String(manufacturingOrder.latestFinalQcDisposition))||manufacturingOrder.status==='QUALITY_HOLD'?'Action needed':manufacturingOrder.latestFinalQcDisposition==='PASS'?'In progress':'Waiting',detail:manufacturingModule18Label??'Requires current-plan Incoming, In-Process and Final QC records.'},
            {title:'Module 19 · Dispatch',state:['SHIPPED','COMPLETED'].includes(c.status)?'Complete':module19DispatchReady?'Ready':'Waiting',detail:manufacturingOrder?module19Label:'Waiting for production and QC release.'},
            {title:'Module 20 · Doctor handoff',state:workflow?.careStage==='ACTIVE'?'In progress':workflow?.careStage==='RETENTION_COMPLETED'?'Complete':workflow?.careStage?'In progress':['SHIPPED','COMPLETED'].includes(c.status)?'Action needed':'Waiting',detail:workflow?.careStage?`Treatment / retention: ${workflow.careStage.replaceAll('_',' ').toLowerCase()}`:['SHIPPED','COMPLETED'].includes(c.status)?'Awaiting the doctor’s receipt confirmation to start treatment.':'Starts after dispatch and doctor receipt confirmation.'},
          ].map((module,index)=><div key={module.title} role="listitem" className="module-flow-card" data-state={module.state.toLowerCase().replaceAll(' ','-')} style={{'--module-index':index,padding:'14px 16px',border:'1px solid #cfe1e4',borderRadius:14,background:'rgba(255,255,255,.78)'} as import('react').CSSProperties}>
            <strong style={{display:'block',fontSize:13,color:'#173e4b'}}>{module.title}</strong>
            <span style={{display:'inline-block',margin:'8px 0',padding:'3px 9px',borderRadius:999,background:module.state==='Complete'?'#e5f5ed':module.state==='Action needed'?'#fff1e9':'#edf4fb',color:module.state==='Complete'?'#176044':module.state==='Action needed'?'#934b24':'#315c83',fontSize:12,fontWeight:700}}>{module.state}</span>
            <p style={{fontSize:13,lineHeight:1.5}}>{module.detail}</p>
          </div>)}
        </div>
        {manufacturingOrder&&<p className="fine-print">{manufacturingOrder.queuePosition!==null&&manufacturingOrder.queuePosition!==undefined?`Queue position ${manufacturingOrder.queuePosition} · `:''}{manufacturingOrder.dueDate?`Due ${String(manufacturingOrder.dueDate).slice(0,10)} · `:''}MES stages, costing and QC evidence remain attached to this order.</p>}
      </section>}

      <div className="dashboard-grid">

        {/* CASE NOTES AND MEMO */}

        <section className="panel padded">
          <span className="eyebrow">
            CLINICAL INFORMATION
          </span>

          <h2>Case notes / memo</h2>

          {caseIntake.intake ? <div className="case-intake-summary">
            <dl className="case-review-list"><dt>Product and arch</dt><dd>{caseIntake.intake.product} · {caseIntake.intake.arch}</dd><dt>Treatment goal</dt><dd>{caseIntake.intake.treatmentGoal}</dd><dt>Prescription</dt><dd>Extractions: {caseIntake.intake.extraction} · IPR: {caseIntake.intake.ipr} · Attachments: {caseIntake.intake.attachments}</dd><dt>Medical history</dt><dd>{caseIntake.intake.medicalHistory || "Not supplied"}</dd><dt>Dental history</dt><dd>{caseIntake.intake.dentalHistory || "Not supplied"}</dd><dt>Allergies</dt><dd>{caseIntake.intake.allergies || "Not supplied"}</dd><dt>Special instructions</dt><dd className="preserve-lines">{caseIntake.intake.specialInstructions || "None"}</dd></dl>
            {caseIntake.notes && <><h3>Additional notes</h3><p className="preserve-lines">{caseIntake.notes}</p></>}
          </div> : <p className="preserve-lines">{c.notes || "No notes supplied."}</p>}

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

      {/* ALLEN 3D CLINICAL PLANNING WORKSPACE */}

      <section className="panel padded" id="3d-clinical-planning">
        <h2>Allen 3D planning workspace</h2>
        <p>Review the patient’s original 3D scans, keep planning notes and deliverables with this case, and review each published plan version in one place.</p>
        <div className="record-grid">
          <article className="panel padded">
            <h3>01 · Inspect the source scan</h3>
            <p>Open a supported model in Allen’s secure viewer. Rotate, pan, and zoom the original file; downloads remain private to this case.</p>
            {planningSources.length > 0 ? <PlanFilesViewer files={planningSources.map(file => ({ id: file.id, name: file.name, url: file.href, ...(file.previewHref ? { previewUrl: file.previewHref } : {}) }))} /> : <p>No 3D scan is attached yet. Add the patient’s original scan in Private clinical records.</p>}
          </article>
          <article className="panel padded">
            <h3>02 · Keep the clinical setup with the case</h3>
            <p>The assigned planning team records segmentation and setup decisions, tooth movement, IPR and attachments, staging, and manufacturing deliverables in the written plan version.</p>
            <p>Each update stays in the case history. Earlier plan versions are preserved for comparison.</p>
          </article>
          <article className="panel padded">
            <h3>03 · Review and decide</h3>
            <p>Review the published plan and attached files here. The treating doctor records the decision for that exact version.</p>
            <p><a className="button" href="#plan-versions">Open plan versions ↓</a></p>
          </article>
        </div>

        <div className="notice">
          <strong>Allen planning workflow</strong>
          <ol>
            <li>Inspect the original scan in the Allen viewer or download it for your clinical workflow.</li>
            <li>The assigned planning team documents its proposed setup, movement, IPR/attachment, staging, and manufacturing details in a plan version.</li>
            <li>The published plan and deliverables stay attached to this case; review history preserves every version.</li>
            <li>The treating doctor reviews the current version and records the clinical decision.</li>
          </ol>
          <p className="fine-print">The viewer displays original scan geometry. It does not segment teeth, calculate movement, or create a treatment recommendation; clinical planning decisions remain with qualified clinicians.</p>
        </div>
      </section>

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
                  {decodeRecordFilename(file.name).filename} {decodeRecordFilename(file.name).recordType ? `· ${decodeRecordFilename(file.name).recordType}` : ""}
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
          patientReference={String(c.patientReference || id)}
          uploaderLabel={doctor.fullName}
          maxFileSize={Math.min(Math.max(1, Number(process.env.MAX_CLINICAL_UPLOAD_BYTES) || 1073741824), 1073741824)}
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
        <p className="notice">Review the exact plan version and its attached 3D files. Add comments with your decision; approve the version or request a revision from the planning team. Previous versions and review history remain available.</p>
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
              {latest?.id === plan.id ? "Current review · " : "Plan version · "}v{plan.version} ·{" "}
              {String(versionAudit.find(e=>e.planId===plan.id && e.detail?.decision)?.detail.decision || plan.decision).replaceAll("_", " ")}
            </span>

            <p className="preserve-lines">
              {plan.summary}
            </p>
            <p><strong>Change summary:</strong> {plan.changeSummary||"No change summary recorded for this legacy version."}</p>
            <p>Author: {plan.authorName||"Not recorded"} · {plan.createdByRole||"Legacy version"}{plan.parentPlanId?" · based on an earlier version":""}</p>
            <p>Internal review: {reviewVersions.find(r=>r.planId===plan.id)?.reviewStatus||"Not recorded"}</p>
            {versionAudit.filter(e=>e.planId===plan.id && e.detail?.decision).map(e=><div className="notice" key={e.id}><p><strong>Doctor decision · plan v{plan.version}</strong></p><p>{e.actorName} · Doctor ID {e.actorId || "not recorded"} · {e.createdAt.toISOString().replace("T", " ").replace("Z", " UTC")} · {String(e.detail.decision).replaceAll("_", " ")}</p><p className="preserve-lines">{e.detail.comments || 'No decision comments supplied.'}</p><p className="fine-print" style={{overflowWrap:'anywhere'}}>Version artifact SHA-256: {e.detail.artifactSha256 || "not recorded"}</p></div>)}
            <p>Prepared: {plan.createdAt.toISOString().replace('T',' ').slice(0,16)} UTC · Submitted to doctor: {submissions.find(r=>r.id===plan.id)?.completedAt?.toISOString().replace('T',' ').slice(0,16)||'Not recorded'} UTC</p>
            {plan.decision==="APPROVED"&&<p>Approved version {plan.version} · {plan.approvedAt?.toISOString().replace("T"," ").slice(0,16)||plan.reviewedAt?.toISOString().replace("T"," ").slice(0,16)||"time unavailable"} · doctor ID {plan.approvedByDoctorId||"not recorded"}</p>}
            <h4>Files bound to v{plan.version}</h4><PlanFilesViewer files={versionFiles.filter(f=>f.planId===plan.id).map(f=>{const fileId=String(f.caseFileId||f.largeFileId);const name=String(f.standardName||f.largeName||"Case file");const standard=Boolean(f.caseFileId);const href=standard?`/api/portal/files/${encodeURIComponent(fileId)}`:`/api/portal/cases/${encodeURIComponent(id)}/large-uploads/files/${encodeURIComponent(fileId)}`;const preview=standard?`/api/portal/files/${encodeURIComponent(fileId)}?preview=1`:`/api/portal/cases/${encodeURIComponent(id)}/large-uploads/files/${encodeURIComponent(fileId)}?preview=1`;return {id:fileId,name,url:href,previewUrl:preview};})} />
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
                label={`Approve plan v${latest.version}`}
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
                  I reviewed plan version v{latest.version} and confirm approval.
                </label>
                <label>
                  Doctor comments <span className="muted">Optional</span>
                  <textarea name="text" maxLength={5000} rows={3} placeholder="Add a note to the version’s review history" />
                </label>
              </PortalForm>

              <PortalForm
                action={action}
                label={`Request revision for v${latest.version}`}
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
                  Comments for the planning team

                  <textarea
                    name="text"
                    required
                    minLength={5}
                    maxLength={5000}
                    rows={4}
                    placeholder={`Describe the changes needed for plan version v${latest.version}`}
                  />
                </label>
              </PortalForm>
            </div>
          )}
      </section>

      <section className="panel padded" id="case-communication">
        <span className="eyebrow">CASE COMMUNICATION</span>
        <h2>Doctor–laboratory communication</h2>
        <p>Send case messages to the assigned laboratory and Allen case team. Messages marked for Allen internal use stay private to the internal team.</p>
        {c.status==='DRAFT'?<p>Submit this case to start its shared conversation.</p>:<Link className="button" href={`/doctor-dashboard/cases/${encodeURIComponent(id)}/communication`}>Open case conversation →</Link>}
      </section>
    </>
  );
}
