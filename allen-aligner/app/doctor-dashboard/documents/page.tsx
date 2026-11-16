import { db } from "../../lib/database";
import { requireDoctor, ownCases } from "../../lib/portal-auth";
export default async function Documents() {
    const d = await requireDoctor();
    const files = await db.caseFile.findMany({ where: { case: ownCases(d) }, select: { id: true, name: true, size: true, case: { select: { patientReference: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
    const large = await db.largeClinicalFile.findMany({ where: { case: ownCases(d) }, select: { id: true, caseId: true, originalName: true, sizeBytes: true, version: true, case: { select: { patientReference: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
    return <><div className="page-heading"><div><h1>Private documents</h1><p>Latest 200 records from each upload system. Downloads require sign-in.</p></div></div><section className="panel padded">{large.map(f => <a className="case-row" key={f.id} href={'/api/portal/cases/' + f.caseId + '/large-uploads/files/' + f.id}><strong>{f.originalName} · v{f.version}</strong><span>{f.case.patientReference}</span><small>{(f.sizeBytes / 1024 / 1024).toFixed(2)} MB</small></a>)}{files.map(f => <a className="case-row" key={f.id} href={'/api/portal/files/' + f.id}><strong>{f.name}</strong><span>{f.case.patientReference}</span><small>{Math.ceil(f.size / 1024)} KB</small></a>)}{!files.length && !large.length && <p>No documents stored. Add records from a case detail page.</p>}</section></>;
}
