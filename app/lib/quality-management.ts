import 'server-only';
import {db,type Database} from './database';

export async function qualityOverview(today:string,canViewAudit:boolean,database:Database=db){
 const [complaintRows,capaRows,auditRows,events]=await Promise.all([
  database.query(`SELECT
    COUNT(*) FILTER (WHERE status NOT IN ('CLOSED','CANCELLED'))::text AS "openComplaints",
    COUNT(*) FILTER (WHERE status NOT IN ('CLOSED','CANCELLED') AND "riskLevel" IN ('HIGH','CRITICAL'))::text AS "highRisk",
    COUNT(*) FILTER (WHERE status NOT IN ('CLOSED','CANCELLED') AND "regulatoryOutcome"='NOT_ASSESSED')::text AS "regulatoryPending",
    COUNT(*) FILTER (WHERE status NOT IN ('CLOSED','CANCELLED') AND "capaRequired" AND "capaId" IS NULL)::text AS "capaPending"
   FROM "QualityComplaint"`),
  database.query(`SELECT
    COUNT(*) FILTER (WHERE status NOT IN ('CLOSED','CANCELLED'))::text AS "openCapas",
    COUNT(*) FILTER (WHERE status NOT IN ('CLOSED','CANCELLED') AND "dueDate" < $1::date)::text AS "overdueCapas"
   FROM "CAPA"`,[today]),
  database.query(`SELECT COUNT(*) FILTER (WHERE status NOT IN ('CLOSED','CANCELLED'))::text AS "openAudits",COUNT(*) FILTER (WHERE status NOT IN ('CLOSED','CANCELLED') AND "plannedDate" < $1::date)::text AS "overdueAudits" FROM "InternalAuditPlan"`,[today]),
  canViewAudit?database.query(`SELECT id,kind,record,action,note,"createdAt",email AS "actorEmail" FROM (
    SELECT a.id::text AS id,'COMPLAINT'::text AS kind,('Complaint: '||c."complainantName")::text AS record,a.action,a.detail->>'note' AS note,a."createdAt",u.email
      FROM "QualityComplaintAudit" a JOIN "QualityComplaint" c ON c.id=a."complaintId" JOIN "HRUser" u ON u.id=a."actorId"
    UNION ALL
    SELECT a.id::text AS id,'CAPA'::text AS kind,('CAPA: '||c.title)::text AS record,a.action,a.detail->>'note' AS note,a."createdAt",u.email
      FROM "CAPAAudit" a JOIN "CAPA" c ON c.id=a."capaId" JOIN "HRUser" u ON u.id=a."actorId"
   ) quality_events ORDER BY "createdAt" DESC LIMIT 12`):Promise.resolve([]),
 ]);
 const complaints=complaintRows[0]??{},capas=capaRows[0]??{},audits=auditRows[0]??{};
 return {
  metrics:{
   openComplaints:Number(complaints.openComplaints??0),highRisk:Number(complaints.highRisk??0),
   regulatoryPending:Number(complaints.regulatoryPending??0),capaPending:Number(complaints.capaPending??0),
   openCapas:Number(capas.openCapas??0),overdueCapas:Number(capas.overdueCapas??0),
   openAudits:Number(audits.openAudits??0),overdueAudits:Number(audits.overdueAudits??0),
  },
  events:events.map(event=>({id:String(event.id),kind:String(event.kind),record:String(event.record),action:String(event.action),actorEmail:String(event.actorEmail),note:event.note==null?null:String(event.note),createdAt:String(event.createdAt)})),
 };
}
