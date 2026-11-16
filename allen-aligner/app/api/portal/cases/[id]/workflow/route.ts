import { apiDoctor, failure, jsonBody } from '../../../../../lib/portal-http';
import { workflowView, updateCaseWorkflow } from '../../../../../lib/extended-case-workflow';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const doctor = await apiDoctor(request); return Response.json(await workflowView((await params).id,{ role: 'DOCTOR', doctor }),{ headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } }); } catch(e) { return failure(e); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const doctor = await apiDoctor(request); return Response.json(await updateCaseWorkflow((await params).id,{ role: 'DOCTOR', doctor },await jsonBody(request)),{ headers: { 'Cache-Control': 'private, no-store' } }); } catch(e) { return failure(e); }
}
