import Link from "next/link";
import WorkspaceRefresh from "../components/workspace-refresh";
import { requireDoctor, ownCases } from "../lib/portal-auth";
import { db } from "../lib/database";

export default async function Dashboard() {
  const doctor = await requireDoctor();
  const where = ownCases(doctor);

  const { total, review, drafts, unread, changes, recent, activity } = await db.transaction(async (tx) => {
    // One read-only transaction and sequential queries on its single PostgreSQL client.
    // Never use Promise.all() for queries sharing the same transaction client.
    const total = await tx.portalCase.count({ where });
    const review = await tx.portalCase.count({ where: { ...where, status: "REVIEW" } });
    const drafts = await tx.portalCase.count({ where: { ...where, status: "DRAFT" } });
    const unread = await tx.notification.count({ where: { doctorId: doctor.id, readAt: null } });
    const changes = await tx.portalCase.count({ where: { ...where, status: "CHANGES_REQUESTED" } });
    const recent = await tx.portalCase.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        patientReference: true,
        category: true,
        status: true,
        updatedAt: true,
      },
    });
    const activity = await tx.caseEvent.findMany({
      where: { case: where },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        label: true,
        createdAt: true,
        caseId: true,
        case: { select: { patientReference: true } },
      },
    });

    return { total, review, drafts, unread, changes, recent, activity };
  }, { isolation: "REPEATABLE READ", readOnly: true });

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">YOUR PRACTICE, IN FOCUS</span>
        <h1>Welcome, {doctor.fullName}.</h1>
        <p>A current view of your cases, reviews and laboratory updates.</p>
      </div>
      <Link className="button" href="/doctor-dashboard/cases/new">New case <span aria-hidden="true">+</span></Link>
    </div>
    <WorkspaceRefresh />
    <div className="stats-grid">
      {[
        { label: "Total cases", value: total, href: "/doctor-dashboard/cases" },
        { label: "Ready for review", value: review, href: "/doctor-dashboard/cases?status=REVIEW" },
        { label: "Drafts to complete", value: drafts, href: "/doctor-dashboard/cases?status=DRAFT" },
        { label: "Unread updates", value: unread, href: "/doctor-dashboard/notifications" },
      ].map((item) =>
        <Link className="stat-card actionable-stat" key={item.label} href={item.href}>
          <span>{item.label}<span aria-hidden="true">↗</span></span>
          <strong>{item.value}</strong>
          <small>View details</small>
        </Link>
      )}
    </div>
    <div className="dashboard-grid professional-dashboard">
      <section className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">YOUR WORKSPACE</span><h2>Recent cases</h2></div>
          <Link className="text-link" href="/doctor-dashboard/cases">View all →</Link>
        </div>
        {recent.length ? recent.map((c) =>
          <Link className="case-row" href={`/doctor-dashboard/cases/${c.id}`} key={c.id}>
            <span className="case-monogram" aria-hidden="true">{c.patientReference.slice(0, 2).toUpperCase()}</span>
            <div><strong>{c.patientReference}</strong><small>{c.category} · Updated {c.updatedAt.toISOString().slice(0, 10)}</small></div>
            <span className="badge" data-status={c.status}>{c.status.replaceAll("_", " ")}</span>
          </Link>
        ) :
          <div className="empty-state">
            <h3>Your first case starts here.</h3>
            <p>Create a draft, add records and submit when you are ready.</p>
            <Link className="button secondary" href="/doctor-dashboard/cases/new">Create a case ↗</Link>
          </div>
        }
      </section>
      <section className="panel padded next-actions">
        <span className="eyebrow">KEEP THINGS MOVING</span>
        <h2>Next actions</h2>
        <Link href="/doctor-dashboard/cases?status=REVIEW"><span><strong>Review proposed plans</strong><small>Record an approval or request changes</small></span><b>{review}</b></Link>
        <Link href="/doctor-dashboard/cases?status=DRAFT"><span><strong>Complete your drafts</strong><small>Add records before submitting</small></span><b>{drafts}</b></Link>
        <Link href="/doctor-dashboard/cases?status=CHANGES_REQUESTED"><span><strong>Follow requested changes</strong><small>Continue the case conversation</small></span><b>{changes}</b></Link>
        <Link className="text-link" href="/resources">Need a guide? Visit Resources ↗</Link>
      </section>
    </div>
    <section className="panel">
      <div className="panel-heading">
        <div><span className="eyebrow">FROM YOUR CASES</span><h2>Latest activity</h2></div>
        <Link className="text-link" href="/doctor-dashboard/notifications">Notifications →</Link>
      </div>
      {activity.length ?
        <ol className="activity-feed">{activity.map((item) =>
          <li key={item.id}>
            <span className="activity-marker" aria-hidden="true" />
            <Link href={`/doctor-dashboard/cases/${item.caseId}`}><strong>{item.label}</strong><small>{item.case.patientReference}</small></Link>
            <time dateTime={item.createdAt.toISOString()}>{item.createdAt.toISOString().slice(0, 10)}</time>
          </li>
        )}</ol> :
        <div className="empty-state"><p>Your case activity will appear here.</p></div>
      }
    </section>
  </>;
}
