import LabQCPanel from '../../../../components/lab-qc-panel';
import { extendedWorkflowEnabled, workflowSchemaReady } from '../../../../lib/extended-case-workflow';
import { notFound } from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}) {
  if(!extendedWorkflowEnabled()||!await workflowSchemaReady())notFound();
  const {id}=await params;
  return <main className="container section"><LabQCPanel caseId={id}/></main>;
}
