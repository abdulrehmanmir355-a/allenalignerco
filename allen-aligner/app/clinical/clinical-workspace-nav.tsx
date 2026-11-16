"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ClinicalSignOutButton from "./sign-out-button";

type Actor = { name: string; role: string; employeeId?: string | null };

export default function ClinicalWorkspaceNav({ actor }: { actor: Actor }) {
  const path = usePathname();
  const leadership = ["LEAD", "ADMIN"].includes(actor.role);
  const links = [
    ["/clinical", "Review workspace", path === "/clinical" || path.startsWith("/clinical/cases/")],
    ["/clinical/work-queue", "Review queue", path === "/clinical/work-queue"],
    ["/clinical/communications", "Communications", path.startsWith("/clinical/communications")],
    ...(leadership ? [
      ["/clinical/leader", "Lead assignments", path === "/clinical/leader"],
      ["/clinical/assignment-board", "Planning queue", path.startsWith("/clinical/assignment-board")],
    ] : []),
    ...(actor.role === "ADMIN" ? [["/clinical/admin", "Administration", path.startsWith("/clinical/admin")]] : []),
    ...(actor.employeeId ? [["/employee", "Employee portal", path.startsWith("/employee")]] : []),
  ] as [string, string, boolean][];

  return (
    <header className="clinical-workspace-header">
      <Link className="clinical-workspace-brand" href="/clinical">
        <strong>Allen Aligner</strong>
        <span>Internal Clinical Review</span>
      </Link>
      <nav aria-label="Internal Clinical Review">
        {links.map(([href, label, active]) => (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="clinical-workspace-user">
        <span><strong>{actor.name}</strong><small>{actor.role.replaceAll("_", " ")}</small></span>
        <ClinicalSignOutButton />
      </div>
    </header>
  );
}
