export type KnowledgeActor = { userId: string; role: string; canEdit: boolean; canPublish: boolean };
export function knowledgeActor(session: { id: string; role: string } | null): KnowledgeActor | null {
  if (!session?.id || !['HR_ADMIN', 'HR_OFFICER', 'HR_VIEWER'].includes(session.role)) return null;
  return { userId: session.id, role: session.role, canEdit: session.role !== 'HR_VIEWER', canPublish: session.role === 'HR_ADMIN' };
}
export function mayPublish(actor: KnowledgeActor, article: { created_by: string; updated_by: string }) {
  return actor.canPublish && article.created_by !== actor.userId && article.updated_by !== actor.userId;
}
