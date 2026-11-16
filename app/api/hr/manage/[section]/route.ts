import { currentHR } from "../../../../lib/hr-auth";
import { hrSchemas, hrRows, hrCreate, hrTransition, type HRSection } from "../../../../lib/hr-management";
import { sameOrigin } from "../../../../lib/portal-auth";
import { failure, jsonBody, PortalError } from "../../../../lib/portal-http";
type Context={params:Promise<{section:string}>};
async function context(c:Context){const user=await currentHR();if(!user)throw new PortalError(401,'Login required.');const {section}=await c.params;if(!(section in hrSchemas)&&section!=='reports')throw new PortalError(404,'Unknown section.');if(section==='users'&&user.role!=='HR_ADMIN')throw new PortalError(403,'Administrator required.');return {user:user as {id:string;role:string},section:section as HRSection};}
export async function GET(_r:Request,c:Context){try{const {section,user}=await context(c);return Response.json({records:await hrRows(section,user)});}catch(e){return failure(e);}}
async function save(r:Request,c:Context,update:boolean){try{if(!sameOrigin(r))throw new PortalError(403,'Invalid request origin.');const {user,section}=await context(c);const body=await jsonBody(r);await (update?hrTransition:hrCreate)(section,body,user);return Response.json({message:'Saved.'});}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='23505')return failure(new PortalError(409,'This record already exists.'));return failure(e);}}
export async function POST(r:Request,c:Context){return save(r,c,false)}
export async function PATCH(r:Request,c:Context){return save(r,c,true)}
