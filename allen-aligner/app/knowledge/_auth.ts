import { currentHR } from "../lib/hr-auth";
import { currentDoctor } from "../lib/portal-auth";
import { knowledgeActor } from "../lib/knowledge-policy";
export type { KnowledgeActor } from "../lib/knowledge-policy";
export async function getKnowledgeActor() {
  const hr = await currentHR();
  if (hr) return knowledgeActor(hr);
  const doctor = await currentDoctor();
  return doctor?.id ? { userId: doctor.id, role: "DOCTOR", canEdit: false, canPublish: false } : null;
}
