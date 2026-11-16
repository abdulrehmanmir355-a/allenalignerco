'use client';

import { useState, type FormEvent } from 'react';

function formatName(name: string) {
  return name.trim().split(/\s+/).map(part =>
    part.split(/([-’'])/).map(piece => /^[’'-]$/.test(piece) ? piece : piece.charAt(0).toLocaleUpperCase() + piece.slice(1).toLocaleLowerCase()).join(''),
  ).join(' ');
}

export default function DoctorWorkspaceBar({ fullName, clinicName }: { fullName: string; clinicName: string | null }) {
  const [signingOut, setSigningOut] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (signingOut) {
      event.preventDefault();
      return;
    }
    setSigningOut(true);
  };

  return (
    <section className="doctor-workspace-bar" aria-label="Signed-in doctor workspace">
      <div className="doctor-workspace-identity">
        <span className="doctor-workspace-dot" aria-hidden="true" />
        <div className="doctor-workspace-details">
          <div className="doctor-workspace-topline">
            <strong className="doctor-workspace-label">Private workspace</strong>
            <span className="doctor-workspace-status"><span aria-hidden="true" />Active session</span>
          </div>
          <p className="doctor-workspace-name">{formatName(fullName)}</p>
          <p className="doctor-workspace-practice">{clinicName?.trim() || 'Practice not listed'}</p>
        </div>
      </div>
      <form action="/api/doctor-logout" method="post" onSubmit={submit} className="doctor-workspace-form">
        <button className="doctor-workspace-signout" type="submit" disabled={signingOut} aria-busy={signingOut}>
          {signingOut && <span className="doctor-workspace-spinner" aria-hidden="true" />}
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
        <span className="doctor-workspace-sr-only" role="status" aria-live="polite">{signingOut ? 'Signing out of your doctor workspace.' : ''}</span>
      </form>
    </section>
  );
}
