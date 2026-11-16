import Link from "next/link";
import { releasedPlanIds } from "../../lib/clinical-service";
import { db } from "../../lib/database";
import { requireDoctor, ownCases } from "../../lib/portal-auth";
export default async function Plans() {
  const doctor = await requireDoctor();
  const plans = await db.treatmentPlan.findMany({
    where: { case: ownCases(doctor) },
    include: { case: { select: { patientReference: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const released = await releasedPlanIds([...new Set(plans.map(plan => plan.caseId))]);
  const visible = plans.filter(plan => released.has(plan.id));

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Treatment plans</h1>
          <p>Laboratory-published plan versions and your review decisions.</p>
        </div>
      </div>
      <section className="panel padded">
        {visible.length ? visible.map(plan => (
          <Link className="case-row" key={plan.id} href={`/doctor-dashboard/cases/${plan.caseId}`}>
            <strong>{plan.case.patientReference}</strong>
            <span>Version {plan.version}</span>
            <span className="badge">{plan.decision}</span>
          </Link>
        )) : <p>No treatment plans published yet.</p>}
        <div className="notice">
          Open a case to inspect original scans in Allen’s 3D viewer and review versioned clinical plans and attached files. Clinical movement and staging decisions are documented by the assigned planning team and reviewed by the treating doctor.
        </div>
      </section>
    </>
  );
}
