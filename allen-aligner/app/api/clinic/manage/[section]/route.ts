import { currentClinic } from "../../../../lib/clinic-auth";
import { clinicRows,clinicSave,clinicTransition, type ClinicSection } from "../../../../lib/clinic-management";
import { sameOrigin } from "../../../../lib/portal-auth";
import { failure,jsonBody,PortalError } from "../../../../lib/portal-http";
type Context={params:Promise<{section:string}>};
async function context(c:Context){const user=await currentClinic();if(!user)throw new PortalError(401,'Clinic login required.');const {section}=await c.params;if(!['dashboard','profile','staff','users','patients','appointments','cases','documents','settings'].includes(section))throw new PortalError(404,'Unknown section.');return {user,section:section as ClinicSection};}
export async function GET(_r:Request,c:Context){try{const {section,user}=await context(c);return Response.json({records:await clinicRows(section,user)});}catch(e){return failure(e);}}
async function save(r:Request,c:Context,update:boolean){try{if(!sameOrigin(r))throw new PortalError(403,'Invalid request origin.');const {section,user}=await context(c);await(update?clinicTransition:clinicSave)(section,await jsonBody(r),user);return Response.json({message:'Saved.'});}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='23505')return failure(new PortalError(409,'Account, staff record or appointment slot already exists.'));return failure(e);}}
export async function POST(r:Request,c:Context){return save(r,c,false)}
export async function PATCH(r:Request,c:Context){return save(r,c,true)}
