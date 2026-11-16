import { requireDoctor } from '@/app/lib/portal-auth';
import CaseCommunication from '@/app/components/case-communication';
import { caseConversation,type Conversation } from '@/app/lib/case-communication';
import { PortalError } from '@/app/lib/portal-http';
import Link from 'next/link';
import styles from '@/app/components/case-communication-styles';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){
 let data:Conversation|undefined;let error='';
 try{const actor={kind:'doctor' as const,doctor:await requireDoctor()};data=await caseConversation((await params).id,actor);}
 catch(e){if(!(e instanceof PortalError))throw e;error=e.message;}
 if(!data)return <div className={styles.workspace}><h1>Case communication unavailable</h1><p>{error}</p><Link href="/doctor-dashboard/cases">Return to your workspace</Link></div>;
 return <div className={undefined}><CaseCommunication key={data.case.id} initial={data} mode="doctor"/></div>;
}
