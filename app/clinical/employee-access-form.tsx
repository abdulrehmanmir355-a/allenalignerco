'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Kept so older links do not render the session-based registration form. */
export default function EmployeeAccessForm() {
  const router = useRouter();
  useEffect(() => { router.replace('/clinical/register'); }, [router]);
  return <main className="clinical"><h1>Employee registration</h1><p>Opening the registration form. It does not sign you in.</p></main>;
}
