export const labTransitions:Record<string,string[]>={SUBMITTED:["PLANNING"],APPROVED:["IN_PRODUCTION"],IN_PRODUCTION:["SHIPPED"],SHIPPED:["COMPLETED"]};
export function canPublishPlan(status:string){return ["SUBMITTED","PLANNING","CHANGES_REQUESTED"].includes(status);}
