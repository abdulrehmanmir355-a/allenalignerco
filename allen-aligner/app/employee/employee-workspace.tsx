'use client';

import { useEffect, useRef, useState } from 'react';
import './work.css';

type Row = Record<string, any>;
type Section = 'My Assigned Tasks'|'Submit Daily Work'|'My Daily Reports'|'Daily Performance'|'My Profile'|'Attendance'|'Leave Records'|'Assigned Assets'|'My Evaluations'|'Notifications'|'Account Settings';
const sections: Section[] = ['My Assigned Tasks','Submit Daily Work','My Daily Reports','Daily Performance','My Profile','Attendance','Leave Records','Assigned Assets','My Evaluations','Notifications','Account Settings'];
const date = (value: unknown) => String(value ?? '').slice(0, 10);

export default function EmployeeWorkspace() {
  const [data,setData] = useState<Row|null>(null);
  const [section,setSection] = useState<Section>('My Assigned Tasks');
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [draft,setDraft] = useState<Row|null>(null);
  const initialized = useRef(false);

  async function load() {
    const response = await fetch('/api/work',{cache:'no-store'});
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'Unable to load your work.');
    if (!body.actor?.employeeId || !['EMPLOYEE','MANAGER'].includes(body.actor.role)) throw new Error('This is not an employee workspace. Sign in with your employee account.');
    setData(body);
    if (!initialized.current) { setSection('My Assigned Tasks'); initialized.current = true; }
  }

  useEffect(()=>{ load().catch(error=>setMessage(error instanceof Error?error.message:'Unable to load your work.')); },[]);

  async function save(action:string,values:Row) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/work',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data:values})});
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Unable to save your work.');
      const confirmation:Record<string,string> = {
        draft:'Saved to your private daily submissions. You can submit it to HR when ready.',
        submit:'Submitted. HR can now review your daily work.',
        revise:'Revision draft saved to your submissions. Submit it when ready.'
      };
      setMessage(confirmation[action] || 'Saved.');
      setDraft(null);
      if (action==='draft') setSection('My Daily Reports');
      await load();
      return true;
    } catch(error) {
      setMessage(error instanceof Error?error.message:'Unable to save your work.');
      return false;
    } finally { setBusy(false); }
  }

  function table(rows:Row[],columns:string[]) {
    return <div className="work-table"><table><thead><tr>{columns.map(column=><th key={column}>{column.replace(/([A-Z])/g,' $1')}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.id||index}>{columns.map(column=><td key={column}>{typeof row[column]==='object'&&row[column]!==null?JSON.stringify(row[column]):String(row[column]??'—')}</td>)}</tr>)}</tbody></table>{!rows.length&&<p>No records yet.</p>}</div>;
  }

  function field(name:string,label:string,type='text',value?:string|number,required=true) {
    return <label key={name}>{label}<input name={name} type={type} defaultValue={value} required={required}/></label>;
  }
  function area(name:string,label:string,value='',required=false) {
    return <label key={name}>{label}<textarea name={name} defaultValue={value} required={required} maxLength={4000}/></label>;
  }
  function form(action:string,children:React.ReactNode,convert:(values:Row)=>Row=values=>values) {
    return <form className="work-form" onSubmit={async event=>{event.preventDefault();await save(action,convert(Object.fromEntries(new FormData(event.currentTarget))));}}>{children}<button disabled={busy}>{busy?'Saving…':action==='draft'?'Save draft':'Save changes'}</button></form>;
  }

  if (!data) return <main className="work-shell work-shell-employee"><header><p className="work-eyebrow">ALLEN ALIGNER · PRIVATE EMPLOYEE WORKSPACE</p><h1>My work</h1><p role="status">{message||'Loading your private workspace…'}</p></header></main>;

  const employeeId=String(data.actor.employeeId);
  const employee:Row|undefined=(data.employees as Row[]).find(row=>row.id===employeeId);
  const tasks:Row[]=(data.tasks as Row[]).filter(row=>row.employeeId===employeeId);
  const reports:Row[]=(data.reports as Row[]).filter(row=>row.employeeId===employeeId);
  const attendance:Row[]=(data.attendance as Row[]).filter(row=>row.employeeId===employeeId);
  const leave:Row[]=(data.leave as Row[]).filter(row=>row.employeeId===employeeId);
  const assets:Row[]=(data.assets as Row[]).filter(row=>row.employeeId===employeeId);
  const evaluations:Row[]=(data.evaluations as Row[]).filter(row=>row.employeeId===employeeId);
  const notifications:Row[]=(data.notifications as Row[]).filter(row=>row.employeeId===employeeId);
  const currentReports=reports.filter(row=>!reports.some(next=>next.previousId===row.id));
  const todayParts=new Intl.DateTimeFormat('en-US',{timeZone:data.policy?.timezone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const today=`${todayParts.find(part=>part.type==='year')?.value}-${todayParts.find(part=>part.type==='month')?.value}-${todayParts.find(part=>part.type==='day')?.value}`;

  return <main className="work-shell work-shell-employee employee-private-workspace">
    <header><p className="work-eyebrow">ALLEN ALIGNER · PRIVATE EMPLOYEE WORKSPACE</p><h1>{section==='My Daily Reports'?'My daily submissions':section}</h1><p>{employee?`${employee.fullName} · ${employee.permanentId} · ${employee.department}`:'Your personal employee account'}</p><p className="employee-private-note">Only your own employee profile, tasks and submissions are shown here.</p></header>
    <div className="work-layout employee-work-layout">
      <nav aria-label="Your employee workspace">{sections.map(item=><button key={item} className={section===item?'selected':''} aria-current={section===item?'page':undefined} onClick={()=>{setSection(item);setDraft(null);}}>{item==='My Daily Reports'?'My Submissions':item}</button>)}<button onClick={async()=>{await fetch('/api/work/auth',{method:'DELETE'});location.href='/employee/login';}}>Sign out</button></nav>
      <article><p role="status" aria-live="polite">{message}</p>{data.actor.mustChangePassword&&<p className="work-alert">Change your temporary password in Account Settings before recording or submitting work.</p>}
        {section==='My Assigned Tasks'&&<><div className="employee-section-intro"><p className="work-eyebrow">YOUR TASK LIST</p><h2>Work assigned to you</h2><p>These tasks are linked to your employee account. Other employees’ tasks are not included.</p></div>{tasks.length?tasks.map(task=><section className="work-report" key={task.id}><h3>{task.title}</h3><p>{task.description||'No additional instructions.'}</p><p><strong>Due:</strong> {date(task.dueDate)||'No due date'} · <strong>Assigned:</strong> {date(task.createdAt)}</p><button type="button" onClick={()=>{setDraft({reportingDate:today,taskId:task.id,workDescription:task.title,workCompleted:'',pendingWork:'',timeSpent:60,workStartTime:null,taskStatus:'IN_PROGRESS',blockers:'',remarks:''});setSection('Submit Daily Work');}}>Record work on this task</button></section>):<p className="employee-empty">No tasks have been assigned to you yet. HR will assign work to your employee account here.</p>}<button type="button" onClick={()=>{setDraft(null);setSection('Submit Daily Work');}}>Record general work</button></>}
        {section==='Submit Daily Work'&&<><div className="employee-section-intro"><p className="work-eyebrow">PRIVATE TO YOUR EMPLOYEE ID</p><h2>{draft?.id?'Update your saved draft':'Record today’s work'}</h2><p>Save a draft first, then submit it from My Submissions. Your report is attached to your employee account.</p></div>{form('draft',<>{draft?.id&&<input type="hidden" name="id" value={draft.id}/>}<label>Reporting date<input name="reportingDate" type="date" required defaultValue={date(draft?.reportingDate)||today} readOnly={!!draft?.id}/></label><label>Assigned task<select name="taskId" defaultValue={draft?.taskId||''}><option value="">General work / no assigned task</option>{tasks.map(task=><option key={task.id} value={task.id}>{task.title}</option>)}</select></label>{area('workDescription','Work description',draft?.workDescription||'',true)}{area('workCompleted','Work completed',draft?.workCompleted||'')}{area('pendingWork','Pending work',draft?.pendingWork||'')}{field('timeSpent','Time spent (minutes)','number',draft?.timeSpent||60)}{field('workStartTime','Work start time','time',draft?.workStartTime?.slice(0,5),false)}<label>Task status<select name="taskStatus" defaultValue={draft?.taskStatus||'IN_PROGRESS'}>{['NOT_STARTED','IN_PROGRESS','COMPLETED','BLOCKED'].map(status=><option key={status}>{status}</option>)}</select></label>{area('blockers','Problems or blockers',draft?.blockers||'')}{area('remarks','Additional comments',draft?.remarks||'')}</>,values=>({...values,timeSpent:Number(values.timeSpent),taskId:values.taskId||null,workStartTime:values.workStartTime||null}))}</>}
        {section==='My Daily Reports'&&<><div className="employee-section-intro"><p className="work-eyebrow">YOUR SUBMISSION HISTORY</p><h2>Saved work and review status</h2><p>Drafts remain private to your account and HR. Submitted items show when they were sent and the latest review status.</p></div><div className="work-metrics"><div><strong>{currentReports.length}</strong>Your reports</div><div><strong>{currentReports.filter(row=>row.status==='DRAFT').length}</strong>Drafts to submit</div><div><strong>{currentReports.filter(row=>['SUBMITTED','REVIEWED'].includes(row.status)).length}</strong>Under review</div></div>{currentReports.length?currentReports.map(report=><details className="work-report" key={report.id}><summary>{date(report.reportingDate)} · {report.status.replaceAll('_',' ')} · Revision {report.revision}</summary><p><strong>Work:</strong> {report.workDescription}</p><p><strong>Completed:</strong> {report.workCompleted||'—'}</p><p><strong>Pending:</strong> {report.pendingWork||'—'}</p><p><strong>Time:</strong> {report.timeSpent} minutes · <strong>Task status:</strong> {report.taskStatus}</p><p><strong>Blockers:</strong> {report.blockers||'None reported'}</p><p><strong>Submitted:</strong> {report.submittedAt||'Not submitted yet'}</p>{report.status==='DRAFT'&&<><button type="button" disabled={busy} onClick={()=>{setDraft(report);setSection('Submit Daily Work');}}>Edit draft</button><button type="button" disabled={busy} onClick={()=>save('submit',{id:report.id})}>Submit to HR</button></>}{['APPROVED','REVISION_REQUESTED'].includes(report.status)&&!reports.some(row=>row.previousId===report.id)&&<button type="button" disabled={busy} onClick={()=>{const reason=prompt('Reason for this revision');if(reason)save('revise',{id:report.id,reason});}}>Create a revision</button>}</details>):<p className="employee-empty">You have no saved daily reports yet. Use Submit Daily Work to record your first entry.</p>}</>}
        {section==='Daily Performance'&&<><div className="employee-section-intro"><p className="work-eyebrow">YOUR ACTIVITY ONLY</p><h2>My work history</h2></div><div className="work-metrics"><div><strong>{currentReports.length}</strong>Your daily records</div><div><strong>{currentReports.filter(row=>row.status==='APPROVED').length}</strong>Approved</div><div><strong>{currentReports.reduce((total,row)=>total+Number(row.timeSpent||0),0)}</strong>Minutes recorded</div></div>{table(currentReports,['reportingDate','status','timeSpent','taskStatus','revision'])}</>}
        {section==='My Profile'&&<>{employee?table([employee],['permanentId','employeeCode','fullName','department','designation','email','phone','joinedOn','status']):<p role="status">Your employee profile is unavailable.</p>}</>}
        {section==='Attendance'&&table(attendance,['day','status'])}
        {section==='Leave Records'&&table(leave,['startDate','endDate','reason','status'])}
        {section==='Assigned Assets'&&(!data.availability?.assets?<p className="employee-empty">Asset history is not available right now.</p>:table(assets,['assetCode','assetName','serialNumber','status','issuedAt','returnedAt']))}
        {section==='My Evaluations'&&table(evaluations,['periodStart','periodEnd','scores','commentary','createdAt'])}
        {section==='Notifications'&&table(notifications,['day','kind','message','createdAt'])}
        {section==='Account Settings'&&<form className="work-form" onSubmit={async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));const response=await fetch('/api/work/auth',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});const body=await response.json();setMessage(body.message||'Unable to change password.');if(response.ok)location.href='/employee/login';}}>{field('currentPassword','Current password','password')}{field('newPassword','New password (12–72 characters)','password')}<button disabled={busy}>Update password</button></form>}
      </article>
    </div>
  </main>;
}
