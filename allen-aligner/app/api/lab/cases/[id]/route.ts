import { randomUUID } from 'node:crypto';
import { planPreparer,revalidatePlanPreparer } from '../../../../lib/plan-preparer';
import { authorizeCaseLab as authorize } from '../../../../lib/lab-auth';
import { guardManagedLabTransition } from '../../../../lib/extended-case-workflow';
import { canTransition } from '../../../../lib/case-lifecycle';
import { recordCaseActivity } from '../../../../lib/case-activity';
import { z } from "zod";
import { db } from "../../../../lib/database";
import { failure, jsonBody, PortalError } from "../../../../lib/portal-http";
import { canPublishPlan } from "../../../../lib/lab-workflow";
import { nextPlanVersion, restoredPlanMetadata } from "../../../../lib/plan-version-policy.mjs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;await authorize(request,id);let preparationIdentity:null|{id:string;employeeId:string;name:string}=null;try{preparationIdentity=await planPreparer(request);}catch(e){if(!(e instanceof PortalError)||![401,403].includes(e.status))throw e;}const c=await db.portalCase.findUnique({where:{id,status:{not:"DRAFT"}},select:{id:true,patientReference:true,category:true,notes:true,status:true,revision:true,plans:{orderBy:{version:"desc"}},events:true,largeFiles:{select:{id:true,originalName:true,sizeBytes:true,version:true,sha256:true}},files:{select:{id:true,name:true,size:true}}}});if(!c)throw new PortalError(404,"Submitted case not found.");const planIds=c.plans.map(p=>p.id);const refs=planIds.length?await db.query(`SELECT f."planId",f."caseFileId",cf.name AS "standardName",f."largeFileId",lf."originalName" AS "largeName" FROM "TreatmentPlanFile" f LEFT JOIN "CaseFile" cf ON cf.id=f."caseFileId" LEFT JOIN "LargeClinicalFile" lf ON lf.id=f."largeFileId" WHERE f."planId"=ANY($1::text[]) ORDER BY f.id`,[planIds]):[];const plans=c.plans.map(p=>({...p,fileReferences:refs.filter(f=>f.planId===p.id).map(f=>({id:String(f.caseFileId||f.largeFileId),kind:f.caseFileId?'standard':'large',name:f.standardName||f.largeName}))}));const messages=await db.query(`SELECT id,author,kind,text,"createdAt" FROM "CaseMessage" WHERE "caseId"=$1 AND audience='CASE' ORDER BY "createdAt",id`,[id]);return Response.json({...c,plans,messages,preparationIdentity},{headers:{"Cache-Control":"private, no-store"}});}catch(e){return failure(e);}}
const summary=z.string().trim().min(10).max(10000);
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("comment"),text:z.string().trim().min(1).max(5000),revision:z.number().int().nonnegative()}),
 z.object({action:z.literal("plan"),summary,changeSummary:z.string().trim().min(5).max(1000).optional(),revision:z.number().int().nonnegative()}),
 z.object({action:z.literal("restore"),sourcePlanId:z.string().min(1).max(100),changeSummary:z.string().trim().min(5).max(1000),revision:z.number().int().nonnegative()}),
 z.object({action:z.literal("status"),status:z.enum(["PLANNING","IN_PRODUCTION","SHIPPED","COMPLETED"]),revision:z.number().int().nonnegative()})
]);
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const access=await authorize(request,id);const p=schema.safeParse(await jsonBody(request));if(!p.success)throw new PortalError(400,"Invalid lab action, missing current revision or change summary.");const b=p.data;
 const awaitingPreparer=b.action==='plan'||b.action==='restore'?await planPreparer(request):null;
 await db.transaction(async tx=>{await tx.query('SELECT id FROM "PortalCase" WHERE id=$1 FOR UPDATE',[id]);const c=await tx.portalCase.findUnique({where:{id},include:{plans:{orderBy:{version:"desc"},take:1}}});if(!c)throw new PortalError(404,"Case not found.");if(c.status==="DRAFT")throw new PortalError(409,"Case is not submitted.");if(b.action!=="comment"&&b.revision!==c.revision)throw new PortalError(409,"Case changed. Fetch the case and retry.");let status=c.status;let text="Laboratory sent a case message";
 if(b.action==="plan"||b.action==="restore"){
   const preparer=await revalidatePlanPreparer(awaitingPreparer!,tx);
   if(!canPublishPlan(c.status))throw new PortalError(409,"Case cannot accept a new plan in this state.");
   const version=nextPlanVersion(c.plans[0]?.version||0);let planSummary:string;let parentPlanId:string|null=c.plans[0]?.id||null;let sourceVersion:number|null=null;let changeSummary:string;
   if(b.action==="restore"){
     const [source]=await tx.query(`SELECT id,version,summary FROM "TreatmentPlan" WHERE id=$1 AND "caseId"=$2`,[b.sourcePlanId,id]);
     if(!source)throw new PortalError(404,"The source version does not belong to this case.");
     sourceVersion=source.version;await tx.query("SELECT set_config('allen.restore_plan_source',$1,true)",[source.id]);const restored=restoredPlanMetadata(source,b.changeSummary);planSummary=restored.summary;parentPlanId=restored.parentPlanId;changeSummary=restored.changeSummary;
   }else{if(version>1&&!b.changeSummary)throw new PortalError(400,"A revision reason is required when creating a new plan version.");planSummary=b.summary;changeSummary=b.changeSummary||"Initial specialist plan submission";}
   const planId=randomUUID();
   await tx.query(`SELECT set_config('allen.preparer_account',$1,true)`,[preparer.id]);
   await tx.query(`INSERT INTO "TreatmentPlan"(id,"caseId",version,summary,decision,"changeSummary","createdByRole","createdById","authorName","parentPlanId","preparedByAccountId","preparedByEmployeeId","preparedAt") VALUES($1,$2,$3,$4,'PENDING',$5,'LAB',$6,$7,$8,$10,$9,clock_timestamp())`,[planId,id,version,planSummary,changeSummary,preparer.id,preparer.name,parentPlanId,preparer.employeeId,preparer.id]);
   status="PLANNING";text=sourceVersion!==null?`Treatment plan v${version} restored from v${sourceVersion} as a new reviewable revision`:`Treatment plan v${version} submitted for internal clinical review`;
 }
 if(b.action==="status"){if(!canTransition("LAB",c.status,b.status))throw new PortalError(409,"Invalid case lifecycle transition.");await guardManagedLabTransition(tx,id,b.status);status=b.status;text=`Case status: ${status.replaceAll("_"," ")}`;}
 const lock=await tx.portalCase.updateMany({where:{id,revision:b.revision},data:{status,revision:{increment:1}}});if(lock.count!==1)throw new PortalError(409,"Stale case revision. Fetch the case and retry.");
 if(b.action==="comment")await tx.caseMessage.create({data:{caseId:id,author:`Lab: ${access.label}`,kind:"comment",text:b.text}});
 await recordCaseActivity(tx,id,c.clinicId,text,{actor:awaitingPreparer?{id:awaitingPreparer.id,name:awaitingPreparer.name,role:'PLANNER'}:{id:`lab:${id}`,name:access.label,role:"LAB"},action:b.action,fromStatus:c.status,status,notes:b.action==="comment"?b.text:null});await tx.notification.create({data:{caseId:id,doctorId:c.doctorId,text}});
 });return Response.json({message:"Lab update saved."});}catch(e){return failure(e);}}
