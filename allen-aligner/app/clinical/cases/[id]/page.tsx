import Link from 'next/link';
import { clinicalActor,clinicalCase } from '@/app/lib/clinical-auth';
import { PortalError } from '@/app/lib/portal-http';
import ClinicalDashboard from '../../review-client';
import '../../review.css';
export default async function Page({params}:{params:Promise<{id:string}>}){
 const {id}=await params;try{await clinicalCase(await clinicalActor(),id);}catch(e){if(!(e instanceof PortalError))throw e;return <main className="clinical"><h1>Case access unavailable</h1><p>{e.message}</p><Link href="/clinical">Clinical dashboard</Link></main>;}
 return <ClinicalDashboard caseId={id}/>;
}
