'use client';

import { useState } from 'react';
import Link from 'next/link';
import EmployeeRegistrationInvitations from '@/app/hr/invitations/invitation-management';
import EmployeeIdentity from '@/app/hr/employee-access/invitations';
import ReviewerAccess from '@/app/hr/reviewer-access/reviewer-access-panel';
import OwnerInvitations from '@/app/hr/owner-invitations/owner-invitation-management';
import AuditInvitations from '@/app/hr/audits/audit-access-panel';
import ClinicalInvitationPanel from '@/app/hr/clinical-invitations/clinical-invitation-panel';

type Props = { role: string };
type Section = 'employee' | 'internal-clinical' | 'reviewer' | 'owner' | 'audit';

export default function AccessHub({ role }: Props) {
  const [active, setActive] = useState<Section>('employee');
  const isHR = ['HR_ADMIN', 'HR_OFFICER', 'HR_VIEWER'].includes(role);
  const canManageEmployees = ['HR_ADMIN', 'HR_OFFICER'].includes(role);
  const canManageAudit = canManageEmployees;
  const sections: { id: Section; label: string }[] = [
    ...(isHR ? [{ id: 'employee' as const, label: 'Employee Registration' }] : []),
    ...(isHR ? [{ id: 'internal-clinical' as const, label: 'Internal Clinical Review Access' }] : []),
    ...(isHR ? [{ id: 'reviewer' as const, label: 'External Clinical Reviewer Invitations' }] : []),
    ...(isHR ? [{ id: 'owner' as const, label: 'Owner Registration' }] : []),
    ...(canManageAudit ? [{ id: 'audit' as const, label: 'Audit Team Access' }] : []),
  ];

  return <div className="clinical">
    <header><div><p className="clinical-eyebrow">HUMAN RESOURCES · ACCESS CONTROL</p><h1>Invitations &amp; Access</h1><p>Employee registration, invitations, and access management in one place.</p></div></header>
    <nav aria-label="Invitation and access sections" className="clinical-controls" style={{ borderBottom: '1px solid #dce7e9', paddingBottom: 16, marginBottom: 24 }}>
      {sections.map(section => <button key={section.id} type="button" aria-pressed={active === section.id} onClick={() => setActive(section.id)} style={{ background: active === section.id ? '#113847' : '#eef5f6', color: active === section.id ? '#fff' : '#113847', border: '1px solid #dce7e9', borderRadius: 999, padding: '11px 18px', fontWeight: 700 }}>{section.label}</button>)}
    </nav>
    {active === 'employee' && <>
      {canManageEmployees && <EmployeeIdentity />}
      <EmployeeRegistrationInvitations />
    </>}
    {active === 'internal-clinical' && <section>
      <p className="clinical-eyebrow">INTERNAL TEAM · HR INVITATION</p>
      <h2>Internal Clinical Review Access</h2>
      <p>Invite an authorized employee. The employee opens the registration page, confirms their Employee ID and official email, and sets a password. A valid invitation activates clinical access. Employees without an invitation remain pending until an Admin or Owner approves them.</p>
      <ClinicalInvitationPanel />
      <p><Link href="/clinical/register">Employee registration page</Link> · <Link href="/clinical/admin/approvals">Admin approval queue</Link></p>
      <button type="button" onClick={() => setActive('reviewer')}>External reviewer invitations</button>
    </section>}
    {active === 'reviewer' && <ReviewerAccess />}
    {active === 'owner' && <OwnerInvitations />}
    {active === 'audit' && canManageAudit && <AuditInvitations />}
  </div>;
}
