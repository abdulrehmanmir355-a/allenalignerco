import {redirect} from 'next/navigation';
import {currentLocalModule,moduleConfigured,loginLocalModule,type LocalModule} from '@/app/lib/local-module-auth';
export default async function LocalModuleLogin({module,searchParams}:{module:LocalModule;searchParams:Promise<{error?:string}>}){
 const destination='/finance';
 const title='Finance Management';
 let configured=false;
 try{if(await currentLocalModule(module))redirect(destination);configured=await moduleConfigured(module);}catch(error){if(error instanceof Error&&error.message.startsWith('NEXT_REDIRECT'))throw error;return <main style={{padding:40}}><h1>{title}</h1><p>Open this workspace on localhost.</p></main>;}
 const params=await searchParams;
 async function signIn(form:FormData){'use server';let error='';try{await loginLocalModule(module,form);}catch(e){error=e instanceof Error?e.message:'Unable to sign in.';}if(error)redirect(destination+'/login?error='+encodeURIComponent(error));redirect(destination);}
 return <main style={{maxWidth:460,margin:'60px auto',padding:28,border:'1px solid #d6e3e7',borderRadius:16}}><h1>{title}</h1><p>{configured?'Sign in to your local workspace.':'Create your local workspace login.'}</p><form action={signIn} style={{display:'grid',gap:18}}><label>Username<input name="username" required minLength={3} maxLength={120} autoComplete="username" style={{display:'block',width:'100%',padding:10}}/></label><label>Password<input type="password" name="password" required minLength={12} maxLength={72} autoComplete={configured?'current-password':'new-password'} style={{display:'block',width:'100%',padding:10}}/></label>{!configured&&<label>Confirm password<input type="password" name="confirm" required minLength={12} maxLength={72} autoComplete="new-password" style={{display:'block',width:'100%',padding:10}}/></label>}<button type="submit">{configured?'Sign in':'Create login and open workspace'}</button>{params.error&&<p role="alert">{params.error}</p>}</form></main>;
}
