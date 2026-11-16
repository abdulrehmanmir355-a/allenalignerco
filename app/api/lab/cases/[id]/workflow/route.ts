import { failure, jsonBody } from '../../../../../lib/portal-http';
import { authorizeCaseLab } from '../../../../../lib/lab-auth';
import { workflowView, updateCaseWorkflow } from '../../../../../lib/extended-case-workflow';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const {id}=await params;const grant=await authorizeCaseLab(request,id);return Response.json(await workflowView(id,{ role:'LAB',id:`lab:${id}`,name:grant.label }),{headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}}); } catch(e) { return failure(e); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const {id}=await params;const grant=await authorizeCaseLab(request,id);return Response.json(await updateCaseWorkflow(id,{ role:'LAB',id:`lab:${id}`,name:grant.label },await jsonBody(request),tx=>authorizeCaseLab(request,id,tx)),{headers:{'Cache-Control':'private, no-store'}}); } catch(e) { return failure(e); }
}
