import { clinicalActor } from '@/app/lib/clinical-auth';
import CaseCommunication from '@/app/components/case-communication';
import { caseConversation,type Conversation } from '@/app/lib/case-communication';
import { PortalError } from '@/app/lib/portal-http';
import Link from 'next/link';
import styles from '@/app/components/case-communication-styles';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){
 let data:Conversation|undefined;let error='';
 try{const actor={kind:'internal' as const,actor:await clinicalActor()};data=await caseConversation((await params).id,actor);}
 catch(e){if(!(e instanceof PortalError))throw e;error=e.message;}
 if(!data)return <div className={styles.workspace}><h1>Case communication unavailable</h1><p>{error}</p><Link href="/clinical">Return to your workspace</Link></div>;
 return <div className={styles.internalPage}><CaseCommunication key={data.case.id} initial={data} mode="internal"/></div>;
}
