'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useState,type FormEvent} from 'react';
export default function AccessForm({register=false}:{register?:boolean}){
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[success,setSuccess]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;const form=e.currentTarget,input=Object.fromEntries(new FormData(form));setBusy(true);setMessage('');setSuccess(false);
  try{
   const r=await fetch('/api/clinical/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:register?'activate':'login',...input})}),b=await r.json();if(!r.ok)throw new Error(b.message||'Unable to continue.');
   if(register){setSuccess(true);setMessage(b.message);form.reset();return;}
   const status=await fetch('/api/clinical/registration',{cache:'no-store'}),s=await status.json();if(!status.ok)throw new Error(s.message);
   if(s.mustChangePassword){setMessage('Change your initial employee password in the Employee Portal, then sign in again.');return;}
   if(s.clinicalRole){router.replace('/clinical');router.refresh();return;}
   setSuccess(true);setMessage(s.clinicalRequest?.status==='PENDING'?'Your account is active. Clinical access is awaiting HR / clinical qualification approval.':s.clinicalRequest?.status==='REJECTED'?'Clinical access was not approved. Contact HR or your clinical administrator.':'Your account has no clinical permission. Contact HR or the clinical administrator.');
  }catch(e){setMessage(e instanceof Error?e.message:'Connection interrupted. Please retry.');}finally{setBusy(false);}
 }
 return <main className="clinical" style={{maxWidth:680}}><span className="clinical-eyebrow">ALLEN ALIGNER · INTERNAL CLINICAL REVIEW</span><h1>{register?'Activate reviewer account':'Clinical email login'}</h1><p>{register?'Use the one-time code issued by HR, then create your personal Allen password. No Employee record is required.':'Sign in with the email and Allen password for your reviewer account. The email may also be used on an Employee record.'}</p><section><form onSubmit={submit}><fieldset disabled={busy}><label>Email address<input name="email" type="email" required maxLength={254} autoComplete="username"/></label>{register&&<label>HR activation code<input name="code" required minLength={64} maxLength={64} pattern="[a-f0-9]{64}" autoComplete="one-time-code" spellCheck={false}/></label>}<label>{register?'Create Allen password':'Allen password'}<input name="password" type="password" required minLength={register?12:1} maxLength={72} autoComplete={register?'new-password':'current-password'}/></label>{register&&<><label>Confirm password<input name="confirmPassword" type="password" required minLength={12} maxLength={72} autoComplete="new-password"/></label><p>Codes expire after 24 hours and can be used once. HR approves clinical reviewer access after activation.</p></>}<button>{busy?'Please wait…':register?'Activate account':'Sign in'}</button></fieldset></form>{message&&<p className={success?'clinical-notice':'clinical-error'} role={success?'status':'alert'}>{message}</p>}<p><Link href={register?'/clinical/login':'/clinical/reviewer-activation'}>{register?'Account active? Sign in':'Have an HR reviewer code? Activate reviewer account'}</Link></p><p><Link href="/clinical/login">Internal employee login</Link> · <Link href="/clinical/register">Employee registration</Link></p></section></main>;
}
