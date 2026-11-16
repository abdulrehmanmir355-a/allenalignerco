
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function EmployeeEditLink({
  employeeId
}: {
  employeeId: string;
}) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function checkPermission() {
      try {
        const response = await fetch(
          "/api/hr/profile-permission",
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal
          }
        );

        if (!response.ok) return;

        const data = await response.json();

        if (!controller.signal.aborted) {
          setAllowed(data.canEditEmployees === true);
        }
      } catch {
        if (!controller.signal.aborted) {
          setAllowed(false);
        }
      }
    }

    void checkPermission();

    return () => controller.abort();
  }, []);

  if (!allowed) return null;

  return (
    <div style={{ margin: "16px 0" }}>
      <Link
        href={`/hr/employees/${encodeURIComponent(employeeId)}/edit`}
        style={{
          display: "inline-block",
          background: "#087989",
          color: "#ffffff",
          padding: "12px 18px",
          borderRadius: 10,
          textDecoration: "none",
          fontWeight: 600
        }}
      >
        Edit Employee Profile
      </Link>

<Link
  href={`/hr/documents/manage?employeeId=${encodeURIComponent(employeeId)}`}
  style={{
    display: "inline-block",
    marginLeft: 12,
    marginTop: 10,
    padding: "12px 18px",
    background: "#113847",
    color: "#ffffff",
    borderRadius: 10,
    textDecoration: "none"
  }}
>
  Manage Documents & Audit
</Link>

    </div>
  );
}
