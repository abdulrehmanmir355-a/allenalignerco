import Link from 'next/link';
import { communicationInbox, type CommunicationActor } from '../lib/case-communication';
import styles from './case-communication-styles';

export default async function CommunicationInbox({actor,search='',page=1}:{actor:CommunicationActor;search?:string;page?:number}){
 const data=await communicationInbox(actor,search,page),doctor=actor.kind==='doctor',base=doctor?'/doctor-dashboard/communication':'/clinical/communications';
 const url=(n:number)=>`${base}?q=${encodeURIComponent(search)}&page=${n}`;
 return <div className={`${styles.workspace} ${doctor?'':styles.internalPage}`}><header className={styles.header}><span className={styles.eyebrow}>Allen communication cell</span><h1>Case Communication</h1><p>{doctor?'Message the laboratory assigned to a case or Allen internal staff.':'Coordinate case questions and updates with treating doctors.'} Each doctor’s case conversation is private to that case.</p><Link href={doctor?'/doctor-dashboard/cases':'/clinical'}>← {doctor?'Your cases':'Clinical workspace'}</Link></header>
  <form className={styles.search} action={base}><input name="q" aria-label="Search case conversations" defaultValue={search} placeholder="Search case reference or doctor" maxLength={100}/><button>Search</button></form>
  <div className={styles.inbox}>{!data.rows.length&&<p className={styles.empty}>No submitted cases match this search. Conversations become available when an authorized case is submitted.</p>}{data.rows.map(c=><Link className={styles.caseLink} key={String(c.id)} href={doctor?`/doctor-dashboard/cases/${encodeURIComponent(String(c.id))}/communication`:`/clinical/cases/${encodeURIComponent(String(c.id))}/communication`}><div><strong>{String(c.patientReference)}</strong><p>{String(c.doctorName)} · {String(c.clinicName)}</p><p>{c.lastText?String(c.lastText).slice(0,180):'No messages yet — open this case conversation.'}</p><small>{String(c.id)} · {Number(c.messageCount)} messages</small></div><div><span className={styles.badge}>{String(c.status).replaceAll('_',' ')}</span><p><small>{c.lastAt?new Date(c.lastAt).toLocaleString('en-GB',{timeZone:'Asia/Karachi',dateStyle:'medium',timeStyle:'short'})+' PKT':'Ready to start'}</small></p><span>Open conversation →</span></div></Link>)}</div>
  <nav className={styles.pages} aria-label="Communication pages">{data.page>1&&<Link href={url(data.page-1)}>Previous page</Link>}{data.hasMore&&<Link href={url(data.page+1)}>Next page</Link>}</nav>
 </div>;
}
