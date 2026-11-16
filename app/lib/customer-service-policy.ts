export const serviceCategories = ['Case status or delay', 'Planning clarification', 'Production or QC', 'Shipment', 'Invoice or payment', 'Portal or files', 'Quality complaint', 'General help'] as const;
export const serviceStates = ['NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_INTERNAL', 'RESOLVED', 'CLOSED', 'CANCELLED'] as const;
export type ServiceState = typeof serviceStates[number];
export type ServiceActor = { id: string; kind: 'HR'|'WORK'|'DOCTOR'|'CLINIC'|'OWNER'; name: string; role: 'REQUESTER'|'AGENT'|'SUPERVISOR'; clinicId: string|null; bootstrap: boolean };
export type ScopeRecord = { requester_id: string; requester_kind: string; clinic_id: string|null; owner_id: string|null; owner_kind: string|null };
export function mayReadTicket(a: ServiceActor, t: ScopeRecord) { return a.role === 'SUPERVISOR' || (a.role === 'AGENT' && a.id === t.owner_id && a.kind === t.owner_kind) || (a.role === 'REQUESTER' && a.id === t.requester_id && a.kind === t.requester_kind && a.clinicId === t.clinic_id); }
export function transitionAllowed(a: ServiceActor, from: ServiceState, to: ServiceState) {
  if (a.role === 'REQUESTER') return (from === 'RESOLVED' && (to === 'CLOSED' || to === 'IN_PROGRESS'));
  const next: Record<ServiceState, ServiceState[]> = { NEW: ['IN_PROGRESS','CANCELLED'], IN_PROGRESS: ['WAITING_CUSTOMER','WAITING_INTERNAL','RESOLVED','CANCELLED'], WAITING_CUSTOMER: ['IN_PROGRESS','RESOLVED','CANCELLED'], WAITING_INTERNAL: ['IN_PROGRESS','RESOLVED','CANCELLED'], RESOLVED: ['CLOSED','IN_PROGRESS'], CLOSED: [], CANCELLED: [] };
  return next[from].includes(to);
}
export function dueAt(start: Date, minutes: number|null) { return minutes === null ? null : new Date(start.getTime() + minutes * 60000); }
export function isBreached(due: Date, completed: Date|null, now: Date) { return completed ? completed.getTime() > due.getTime() : now.getTime() >= due.getTime(); }
export function priorityFrom(impact: string, urgency: string): 'P1'|'P2'|'P3'|'P4' {
  if (impact === 'HIGH') return urgency === 'ROUTINE' ? 'P2' : 'P1';
  if (impact === 'MEDIUM') return urgency === 'ROUTINE' ? 'P3' : 'P2';
  return urgency === 'IMMEDIATE' ? 'P2' : urgency === 'TIME_SENSITIVE' ? 'P3' : 'P4';
}
