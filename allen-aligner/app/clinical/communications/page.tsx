import { clinicalActor } from '@/app/lib/clinical-auth';
import CommunicationInbox from '@/app/components/communication-inbox';
import ClinicalLabOverview from './clinical-lab-overview';
import { PortalError } from '@/app/lib/portal-http';
import type { CommunicationActor } from '@/app/lib/case-communication';
import Link from 'next/link';
export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; tab?: string }>;
}) {
  let actor: CommunicationActor | undefined;
  let error = '';
  let clinicalRole = '';
  try {
    const a = await clinicalActor();
    actor = { kind: 'internal' as const, actor: a };
    clinicalRole = a.role;
  } catch (e) {
    if (!(e instanceof PortalError)) throw e;
    error = e.message;
  }

  if (!actor) {
    return (
      <main>
        <h1>Communication access required</h1>
        <p>{error}</p>
        <Link href="/clinical/login">Sign in</Link>
      </main>
    );
  }

  const p = await searchParams;
  const tab = p.tab === 'lab' ? 'lab' : 'cases';
  const search = typeof p.q === 'string' ? p.q : '';
  const page = Number(p.page) || 1;

  return (
    <main>
      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #dce7e9', marginBottom: 0 }}>
        <Link
          href="/clinical/communications?tab=cases"
          style={{
            padding: '12px 24px',
            fontWeight: tab === 'cases' ? 700 : 400,
            borderBottom: tab === 'cases' ? '3px solid #087989' : '3px solid transparent',
            color: '#087989',
            textDecoration: 'none',
            fontSize: 15,
          }}
        >
          ✉ Case Communication
        </Link>
        {['LEAD', 'ADMIN'].includes(clinicalRole) && (
          <Link
            href="/clinical/communications?tab=lab"
            style={{
              padding: '12px 24px',
              fontWeight: tab === 'lab' ? 700 : 400,
              borderBottom: tab === 'lab' ? '3px solid #087989' : '3px solid transparent',
              color: '#087989',
              textDecoration: 'none',
              fontSize: 15,
            }}
          >
            🔬 Lab–Doctor Direct Communication
          </Link>
        )}
      </div>

      {tab === 'cases' ? (
        <CommunicationInbox actor={actor} search={search} page={page} />
      ) : (
        <ClinicalLabOverview />
      )}
    </main>
  );
}
