import {currentHR} from '@/app/lib/hr-auth';
import {sameOrigin} from '@/app/lib/portal-auth';
import {failure,jsonBody,PortalError} from '@/app/lib/portal-http';
import {manageReviewerAccess,reviewerAccessData} from '@/app/lib/reviewer-access';
export async function GET(){try{return Response.json(await reviewerAccessData(await currentHR()),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
export async function POST(r:Request){try{if(!sameOrigin(r))throw new PortalError(403,'Invalid request origin.');return Response.json(await manageReviewerAccess(await jsonBody(r),await currentHR()),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
