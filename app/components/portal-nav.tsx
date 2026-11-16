"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const links = [
  ["/doctor-dashboard", "Overview", "◫"],
  ["/clinic/patients", "Patient Master", "◎"],
  ["/doctor-dashboard/patients", "Patients", "◎"],
  ["/doctor-dashboard/history", "Case history", "◇"],
  ["/doctor-dashboard/communication", "Doctor–Lab Chat", "✉"],
  ["/doctor-dashboard/plans", "Treatment plans", "◇"],
  ["/doctor-dashboard/documents", "Documents", "▧"],
  ["/doctor-dashboard/notifications", "Notifications", "○"],
  ["/doctor-dashboard/support", "Customer Service", "◎"],
  ["/doctor-dashboard/clinic", "Clinic & doctors", "◫"],
  ["/doctor-dashboard/profile", "My profile", "◎"],
  ["/doctor-dashboard/settings", "Settings", "◎"],
];

export default function PortalNav() {
  const path = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPending = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => () => clearPending(), [path]);
  const inCases = path.startsWith("/doctor-dashboard/cases");
  const navLink = ([href, label, icon]: string[]) => (
    <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
      <span aria-hidden="true">{icon}</span>{label}
    </Link>
  );

  return (
    <aside className="portal-sidebar">
      <span className="eyebrow">DOCTOR WORKSPACE</span>
      <nav aria-label="Workspace navigation">
        {links.slice(0, 2).map(navLink)}
        <details
          key={path}
          className={`workspace-case-group${inCases ? " is-active" : ""}`}
          open={inCases}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              clearPending();
              event.currentTarget.open = inCases;
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              clearPending();
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches) {
              clearPending();
              const details = event.currentTarget;
              timer.current = setTimeout(() => { details.open = true; }, 300);
            }
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") {
              clearPending();
              const details = event.currentTarget;
              if (!details.contains(document.activeElement)) {
                timer.current = setTimeout(() => { details.open = inCases; }, 300);
              }
            }
          }}
        >
          <summary onClick={clearPending}><span aria-hidden="true">▤</span>Cases</summary>
          <div className="workspace-case-links">
            <Link href="/doctor-dashboard/cases" aria-current={path === "/doctor-dashboard/cases" ? "page" : undefined}>All cases</Link>
            <Link href="/doctor-dashboard/cases/new" aria-current={path === "/doctor-dashboard/cases/new" ? "page" : undefined}>New case</Link>
          </div>
        </details>
        {links.slice(2).map(navLink)}
        
      </nav>
      <div className="sidebar-help">
        <span className="small-symbol">✧</span>
        <h3>A place for every step.</h3>
        <p>Track your cases and communicate with the Allen internal team.</p>
        <Link href="/how-it-works">View the workflow ↗</Link>
      </div>
      <Link href="/">← Back to website</Link>
    </aside>
  );
}
