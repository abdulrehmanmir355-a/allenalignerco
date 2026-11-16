import Link from 'next/link';
import { serviceActor } from '../lib/customer-service';
import ServiceWorkspace from './workspace';
import styles from './service.module.css';
export const dynamic='force-dynamic';
export const metadata={title:'Customer Service',robots:{index:false,follow:false}};
export default async function CustomerService({searchParams}:{searchParams:Promise<{ticket?:string;case?:string}>}){
 const actor=await serviceActor(),params=await searchParams;
 if(!actor)return <main className={styles.root}><section className={styles.welcome}><span className={styles.eyebrow}>ALLEN OPERATING SYSTEM</span><h1>Every request.<br/>A clear next step.</h1><p>Case questions, delivery updates and practice support, connected to your Allen workspace.</p><div className={styles.steps}>{['Ticket','Owner','Priority','SLA','Escalation','Resolution'].map((s,i)=><span key={s}><small>0{i+1}</small>{s}</span>)}</div><div className={styles.actions}><Link href="/doctor-login">Doctor sign in →</Link><Link href="/clinic-login">Clinic sign in →</Link><Link href="/hr/login">Service team / Owner →</Link></div><p className={styles.muted}>Service staff with an employee account can use <Link href="/employee/login">Employee sign in</Link>. Access is assigned by the Owner.</p></section></main>;
 return <ServiceWorkspace actor={actor} initialId={params.ticket||''} initialCase={params.case||''}/>;
}
