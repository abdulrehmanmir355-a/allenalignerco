import { requireDoctor } from '@/app/lib/portal-auth';
import CommunicationInbox from '@/app/components/communication-inbox';
import { PortalError } from '@/app/lib/portal-http';
import type { CommunicationActor } from '@/app/lib/case-communication';
import Link from 'next/link';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;page?:string}>}){
 let actor:CommunicationActor|undefined;let error='';
 try{actor={kind:'doctor' as const,doctor:await requireDoctor()};}catch(e){if(!(e instanceof PortalError))throw e;error=e.message;}
 if(!actor)return <main><h1>Communication access required</h1><p>{error}</p><Link href="/doctor-login">Sign in</Link></main>;
 const p=await searchParams;return <CommunicationInbox actor={actor} search={typeof p.q==='string'?p.q:''} page={Number(p.page)||1}/>;
}
