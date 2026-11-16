'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ClinicalSignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/work/auth', { method: 'DELETE' });
      if (!response.ok) throw new Error('Unable to sign out. Please try again.');
      router.replace('/clinical/login');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out. Please try again.');
      setBusy(false);
    }
  }

  return <div className="clinical-session-actions"><button type="button" onClick={signOut} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>{error && <span role="alert">{error}</span>}</div>;
}
