"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clinicLinks } from "./clinic-links";

export default function ClinicNavigation() {
  const path = usePathname();
  return (
    <div className="clinic-navigation">
      <nav className="clinic-links" aria-label="Clinic navigation">
        <Link href="/">Home</Link>
        {clinicLinks.map(([href, label]) => (
          <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
      <nav className="clinic-links clinic-workspace-links" aria-label="Related workspaces">
        <Link href="/doctor-dashboard">Doctor workspace</Link>
        <Link href="/doctor-dashboard/cases/new">New case (doctor sign-in)</Link>
      </nav>
    </div>
  );
}

