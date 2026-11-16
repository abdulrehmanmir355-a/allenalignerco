import 'server-only';
import {cookies,headers} from 'next/headers';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID,randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {hash,compare} from 'bcryptjs';
import path from 'node:path';
export type LocalModule='finance';
type Account={id:string;username:string;passwordHash:string;secret:string};
const file=(module:LocalModule)=>path.join(process.cwd(),'.private','module-access',module+'.json');
export async function assertLocalModuleHost(){
 const host=(await headers()).get('host')||'';
 if(process.env.NETLIFY||process.env.VERCEL||!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))throw new Error('This workspace is available on localhost only.');
}
async function account(module:LocalModule):Promise<Account|null>{
 try{return JSON.parse(await readFile(file(module),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
}
export async function moduleConfigured(module:LocalModule){await assertLocalModuleHost();return !!await account(module);}
export async function currentLocalModule(module:LocalModule){
 await assertLocalModuleHost();
 const token=(await cookies()).get('allen_local_'+module)?.value;
 if(!token)return null;
 const a=await account(module);if(!a)return null;
 const [payload,signature,...rest]=token.split('.');if(!payload||!signature||rest.length)return null;
 const expected=createHmac('sha256',a.secret).update(payload).digest('hex');
 if(!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
 try{const data=JSON.parse(Buffer.from(payload,'base64url').toString());if(data.id!==a.id||data.expires<Date.now())return null;}catch{return null;}
 return {id:a.id,email:a.username,role:'HR_ADMIN' as const};
}
export async function loginLocalModule(module:LocalModule,form:FormData){
 await assertLocalModuleHost();
 const username=String(form.get('username')||'').trim();const password=String(form.get('password')||'');
 if(username.length<3||username.length>120||password.length<12||Buffer.byteLength(password)>72)throw new Error('Use a username of 3–120 characters and password of 12–72 bytes.');
 let a=await account(module);
 if(!a){
  if(password!==form.get('confirm'))throw new Error('Passwords must match.');
  a={id:randomUUID(),username,passwordHash:await hash(password,12),secret:randomBytes(32).toString('hex')};
  await mkdir(path.dirname(file(module)),{recursive:true});
  try{await writeFile(file(module),JSON.stringify(a),{encoding:'utf8',flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw new Error('Account already created. Reload and sign in.');throw error;}
 }
 if(a.username!==username||!await compare(password,a.passwordHash))throw new Error('Invalid username or password.');
 const expires=Date.now()+8*60*60*1000;
 const payload=Buffer.from(JSON.stringify({id:a.id,expires})).toString('base64url');
 const signature=createHmac('sha256',a.secret).update(payload).digest('hex');
 (await cookies()).set('allen_local_'+module,payload+'.'+signature,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/',expires:new Date(expires)});
}
export async function logoutLocalModule(module:LocalModule){await assertLocalModuleHost();(await cookies()).delete('allen_local_'+module);}
