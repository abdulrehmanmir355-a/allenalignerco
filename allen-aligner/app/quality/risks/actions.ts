'use server';
import {currentHR} from '@/app/lib/hr-auth';
import {readRisks,saveRisk} from './store';
import {revalidatePath} from 'next/cache';
export async function riskAccess(){
 const actor=await currentHR();
 if(!actor)throw new Error('Sign in with your active HR account to access Risk Management.');
 if(!['HR_ADMIN','HR_OFFICER'].includes(actor.role))throw new Error('HR Admin or HR Officer access is required to manage the risk register.');
 return actor;
}
export async function submitRisk(form:FormData){
 try{const actor=await riskAccess();await saveRisk(form,actor.email);revalidatePath('/quality/risks');return {ok:true,error:''};}
 catch(error){return {ok:false,error:error instanceof Error?error.message:'Unable to save risk.'};}
}
export async function exportRisks(){await riskAccess();return JSON.stringify(await readRisks(),null,2);}
