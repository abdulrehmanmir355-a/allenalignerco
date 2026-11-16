import { canTransition } from '../../../../lib/case-lifecycle';
import { randomUUID } from 'node:crypto';
import { sendCaseCommunication } from '../../../../lib/case-communication';
import { planArtifact } from '../../../../lib/treatment-approval';
import { recordCaseActivity } from '../../../../lib/case-activity';
import { z } from "zod";
import { db } from "../../../../lib/database";
import { ownCases } from "../../../../lib/portal-auth";
import { apiDoctor, failure, jsonBody, PortalError } from "../../../../lib/portal-http";
import { isCurrentPlanDecision } from "../../../../lib/plan-version-policy.mjs";
const schema=z.object({action:z.enum(["submit","comment","adjustment","approve","reject","opened"]),text:z.string().trim().max(5000).optional(),clientRequestId:z.uuid().optional(),confirmed:z.enum(['yes']).optional(),planId:z.string().min(1).max(100).optional(),revision:z.union([z.number().int().nonnegative().safe(),z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative().safe())]).optional()}).strict();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {const d=await apiDoctor(request);const {id}=await params;const p=schema.safeParse(await jsonBody(request));if(!p.success)throw new PortalError(400,"Invalid case action."); const b=p.data;
 if(b.action==='comment'){await sendCaseCommunication(id,{kind:'doctor',doctor:d},{text:b.text||'',clientRequestId:b.clientRequestId||randomUUID(),...(b.planId?{planId:b.planId}:{})});return Response.json({message:'Message saved to this case.'},{headers:{'Cache-Control':'no-store'}});}
 await db.transaction(async tx=>{
 await tx.query('SELECT id FROM "PortalCase" WHERE id=$1 AND "doctorId"=$2 AND "clinicId"=$3 FOR UPDATE',[id,d.id,d.clinicId]);
 const c=await tx.portalCase.findFirst({where:{id,...ownCases(d)},include:{plans:{orderBy:{version:"desc"},take:1},_count:{select:{files:true,largeFiles:true}}}}); if(!c)throw new PortalError(404,"Case not found.");
 if(b.action==='opened'){
  const plan=c.plans[0];
  if(!plan || plan.id!==b.planId || !(await tx.query(`SELECT 1 FROM "ClinicalReview" WHERE "planId"=$1 AND status='APPROVED'`,[plan.id])).length)throw new PortalError(409,'The current plan is not released for doctor review.');
  const opened=await tx.query(`INSERT INTO "TreatmentPlanVersionAudit"("planId","caseId","actorId","actorName","actorRole",action,detail)
   VALUES($1,$2,$3,$4,'DOCTOR','DOCTOR_OPENED',jsonb_build_object('version',$5::int)) ON CONFLICT DO NOTHING RETURNING id`,[plan.id,id,d.id,d.fullName,plan.version]);
  if(opened.length)await recordCaseActivity(tx,id,c.clinicId,`Doctor opened plan v${plan.version}`,{actor:{id:d.id,name:d.fullName,role:'DOCTOR'},action:'plan_opened',fromStatus:c.status,status:c.status,notes:null});
  return;
 }
 if(b.revision!==c.revision)throw new PortalError(409,"Case changed or revision missing. Refresh and retry.");
 let status=c.status; let label="Doctor message added";
 if(b.action==="submit"){if(c.status!=="DRAFT"||!(c._count.files+c._count.largeFiles))throw new PortalError(409,"Attach at least one record to your draft before submitting.");status="SUBMITTED";label="Case submitted to laboratory";}
 if(b.action==="approve"||b.action==="adjustment"||b.action==="reject"){
  const plan=c.plans[0]; if(!isCurrentPlanDecision({caseStatus:c.status,latestPlan:plan,requestedPlanId:b.planId}))throw new PortalError(409,"This plan is no longer the pending current version awaiting review. Refresh the case.");
  if(!(await tx.query('SELECT 1 FROM "ClinicalReview" WHERE "planId"=$1 AND status=\'APPROVED\' AND "independenceVerified"',[plan.id])).length)throw new PortalError(409,"This version requires independent clinical approval from a clinician other than its preparer.");
  if(b.action!=="approve"&&(!b.text||b.text.length<5))throw new PortalError(400,"Provide a reason of at least five characters.");
  if(b.action==='approve'&&b.confirmed!=='yes')throw new PortalError(400,'Confirm that you reviewed this exact plan version.');
  const artifact=await planArtifact(tx,plan.id);
  await tx.query(`SELECT set_config('allen.plan_decision',$1,true),set_config('allen.plan_comments',$2,true),set_config('allen.plan_manifest',$3,true),set_config('allen.plan_sha256',$4,true),set_config('allen.plan_confirmed',$5,true)`,[b.action==='approve'?'APPROVED':b.action==='reject'?'REJECTED':'CHANGES_REQUESTED',b.text||'',JSON.stringify(artifact.manifest),artifact.sha256,b.confirmed||'']);
  const decisionAt=new Date();
  await tx.query(`SELECT set_config('allen.plan_actor_id',$1,true),set_config('allen.plan_actor_name',$2,true),set_config('allen.plan_actor_role','DOCTOR',true)`,[d.id,d.fullName]);
  await tx.treatmentPlan.update({where:{id:plan.id},data:{decision:b.action==="approve"?"APPROVED":"CHANGES_REQUESTED",reviewedAt:decisionAt,approvedByDoctorId:b.action==="approve"?d.id:null,approvedAt:b.action==="approve"?decisionAt:null}});
  status=b.action==="approve"?"APPROVED":"CHANGES_REQUESTED";label=`Plan v${plan.version}: ${b.action==='reject'?'REJECTED — manufacturing blocked':status.replaceAll("_"," ")}`;
 }
 if(status!==c.status&&!canTransition("DOCTOR",c.status,status))throw new PortalError(409,"Invalid doctor lifecycle transition.");
 const locked=await tx.portalCase.updateMany({where:{id,revision:c.revision,...ownCases(d)},data:{status,revision:{increment:1}}});if(locked.count!==1)throw new PortalError(409,"Case changed. Refresh and retry.");
 if(b.text)await tx.caseMessage.create({data:{caseId:id,author:d.fullName,kind:b.action,text:b.planId?`Plan ${b.planId}: ${b.text}`:b.text}});
 await recordCaseActivity(tx,id,c.clinicId,label,{actor:{id:d.id,name:d.fullName,role:"DOCTOR"},action:b.action,fromStatus:c.status,status,notes:b.text||null});
 if(b.action==='approve')await recordCaseActivity(tx,id,c.clinicId,`Plan ${b.planId}: manufacturing eligible; authorized laboratory release required`,{actor:{id:d.id,name:d.fullName,role:'DOCTOR'},action:'manufacturing_eligible',fromStatus:status,status,notes:null});
 });return Response.json({message:"Case updated."});}catch(e){return failure(e);}
}
