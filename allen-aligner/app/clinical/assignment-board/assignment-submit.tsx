'use client';
import { useFormStatus } from 'react-dom';

export default function AssignmentSubmit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-disabled={pending} style={{ padding: '11px 14px', border: 0, borderRadius: 8, background: '#087989', color: 'white', fontWeight: 700, cursor: pending ? 'wait' : 'pointer' }}>{pending ? 'Saving assignment…' : 'Save assignment'}</button>;
}
