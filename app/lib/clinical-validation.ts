import { z } from 'zod';
export const checklistLabels = {
 completeness: 'Case information completeness', records: 'Clinical record availability', consistency: 'Treatment plan consistency',
 movement: 'Tooth movement review', attachments: 'Attachment review', ipr: 'IPR review', staging: 'Treatment staging',
 concerns: 'Clinical concerns', information: 'Further information required',
} as const;
export const finding = z.object({ result: z.enum(['CONFIRMED','CONCERN','NOT_APPLICABLE']), note: z.string().trim().max(1500) });
export const checklistSchema = z.record(z.enum(Object.keys(checklistLabels) as [keyof typeof checklistLabels, ...Array<keyof typeof checklistLabels>]), finding);
export const clinicalActionSchema = z.intersection(z.object({planId:z.string().min(1).max(100)}),z.discriminatedUnion('action',[
 z.object({action:z.literal('record_preparer'),revision:z.number().int().nonnegative().safe(),preparedByAccountId:z.uuid(),reason:z.string().trim().min(10).max(2000),confirmed:z.literal(true)}),
 z.object({action:z.literal('request_new_version'),revision:z.number().int().nonnegative().safe(),reason:z.string().trim().min(10).max(2000)}),
 z.object({ action:z.literal('assign'), revision:z.number().int().nonnegative(), assignedTo:z.string().uuid(), priority:z.enum(['NORMAL','HIGH','URGENT']), dueDate:z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const parsed = new Date(value + 'T00:00:00Z'); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; })]).optional() }),
 z.object({ action:z.literal('start'), revision:z.number().int().nonnegative() }),
 z.object({ action:z.literal('save'), revision:z.number().int().nonnegative(), checklist:checklistSchema, notes:z.string().trim().max(5000) }),
 z.object({ action:z.enum(['approve','revise','return','escalate','observe']), revision:z.number().int().nonnegative(), reason:z.string().trim().min(1).max(5000), confirmed:z.boolean().optional() }),
]));
export function approvalProblem(checklist:unknown):string|null {
 const parsed=checklistSchema.safeParse(checklist);
 if(!parsed.success)return 'Complete all nine checklist findings before approval.';
 for(const [key,value] of Object.entries(parsed.data)) {
  if(value.result==='CONCERN')return 'Resolve clinical concerns through revision before approval.';
  if(value.result==='NOT_APPLICABLE' && (!['attachments','ipr'].includes(key)||!value.note))return 'Only attachment and IPR reviews may be marked not applicable, with a written reason.';
 }
 return null;
}
