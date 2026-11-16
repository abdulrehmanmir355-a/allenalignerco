import 'server-only';
import {mkdir, readFile, writeFile, rename, open, unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';

export const riskSchema=z.object({
 id:z.string().uuid(), title:z.string().trim().min(3).max(160),
 category:z.enum(['Clinical','Production','Supplier','Data security','Operational','Other']),
 description:z.string().trim().min(3).max(4000), owner:z.string().trim().min(2).max(160),
 severity:z.coerce.number().int().min(1).max(5), likelihood:z.coerce.number().int().min(1).max(5),
 residualSeverity:z.coerce.number().int().min(1).max(5), residualLikelihood:z.coerce.number().int().min(1).max(5),
 mitigation:z.string().trim().min(3).max(4000), reviewDate:z.iso.date(),
 status:z.enum(['Open','Mitigating','Monitoring','Closed']),
 evidence:z.string().trim().max(4000), updatedAt:z.string(),
 history:z.array(z.object({at:z.string(), actor:z.string(), note:z.string()}))
});
export type Risk=z.infer<typeof riskSchema>;
const directory=path.join(process.cwd(),'.private','risk-management');
const filename=path.join(directory,'register.json');
export function level(score:number){return score>=20?'Critical':score>=12?'High':score>=6?'Moderate':'Low';}
export async function readRisks():Promise<Risk[]>{
 try {return z.array(riskSchema).parse(JSON.parse(await readFile(filename,'utf8')));}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
}
export async function saveRisk(form:FormData,actor:string){
 await mkdir(directory,{recursive:true});
 const lock=path.join(directory,'write.lock');
 let handle;
 try{handle=await open(lock,'wx');}catch{throw new Error('The risk register is busy. Please retry.');}
 try{
  const records=await readRisks();
  const id=String(form.get('id')||'');
  const previous=id?records.find(record=>record.id===id):undefined;
  if(id&&!previous)throw new Error('Risk no longer exists. Reload the register.');
  if(previous&&form.get('version')!==previous.updatedAt)throw new Error('This risk was changed by another user. Reload before saving.');
  const now=new Date().toISOString();
  const result=riskSchema.safeParse({...Object.fromEntries(form),id:previous?.id||randomUUID(),updatedAt:now,history:[]});
  if(!result.success)throw new Error('Complete all required fields. Scores must be 1–5 and the review date must be valid.');
  const risk=result.data;
  if(risk.status==='Closed'&&!risk.evidence)throw new Error('Closure requires verification evidence.');
  risk.history=[...(previous?.history||[]),{at:now,actor,note:JSON.stringify({action:previous?'Updated':'Created',...Object.fromEntries(Object.entries(risk).filter(([key])=>key!=='history'))})}];
  const next=previous?records.map(record=>record.id===id?risk:record):[risk,...records];
  const temporary=filename+'.'+randomUUID()+'.tmp';
  await writeFile(temporary,JSON.stringify(next,null,2),'utf8');
  await rename(temporary,filename);
 }finally{await handle.close();await unlink(lock);}
}
