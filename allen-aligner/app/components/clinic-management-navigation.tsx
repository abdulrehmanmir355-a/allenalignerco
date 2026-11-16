"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  ["/clinic/manage/dashboard", "Overview"],
  ["/clinic/manage/profile", "Clinic profile"],
  ["/clinic/manage/users", "People & access"],
  ["/clinic/patients", "Patient master"],
  ["/clinic/manage/appointments", "Appointments"],
  ["/clinic/manage/cases", "Cases"],
  ["/clinic/manage/documents", "Documents"],
  ["/clinic/manage/settings", "Settings"],
] as const;

export default function ClinicManagementNavigation() {
  const path = usePathname();

  return (
    <header className="management-nav clinic-management-nav">
      <Link className="management-nav-brand" href="/clinic/manage/dashboard">
        <strong>Allen Aligner</strong>
        <span>Clinic workspace</span>
      </Link>
      <nav aria-label="Clinic management">
        {sections.map(([href, label]) => (
          <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <form method="post" action="/api/clinic/auth/logout">
        <button type="submit">Sign out</button>
      </form>
    </header>
  );
}
