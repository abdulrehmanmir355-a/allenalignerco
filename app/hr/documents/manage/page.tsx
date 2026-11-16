import { redirect } from 'next/navigation';
import { currentHR } from '@/app/lib/hr-auth';
import { db } from '@/app/lib/database';
import DocumentManager from './document-manager';
export default async function Page({searchParams}:{searchParams:Promise<{employeeId?:string}>}){const hr=await currentHR();if(hr?.role!=='HR_ADMIN')redirect('/hr/login');const {employeeId}=await searchParams;const employees=await db.query('SELECT id,"fullName","permanentId" FROM "Employee" ORDER BY "fullName"');return <main style={{maxWidth:1100,margin:'32px auto',padding:24}}><h1>Employee document management</h1><form><label>Employee<select name="employeeId" defaultValue={employeeId}>{employees.map(e=><option key={String(e.id)} value={String(e.id)}>{e.permanentId} · {e.fullName}</option>)}</select></label><button>Open documents</button></form>{employeeId&&employees.some(e=>e.id===employeeId)&&<DocumentManager employeeId={employeeId}/>}</main>;}
