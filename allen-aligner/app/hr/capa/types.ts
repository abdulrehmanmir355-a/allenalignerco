export type Capa = {
  id:string; sourceType:string; severity:string; title:string; description:string; containment:string; rootCause:string;
  correction:string; correctiveAction:string; preventiveAction:string; effectivenessCheck:string; assignedTo:string;
  dueDate:string; status:string; createdAt:string; updatedAt:string; closedAt:string|null;
};
export type CapaAudit = { id:string; capaId:string; title:string; action:string; detail:{note?:string}; createdAt:string; actorEmail:string };
