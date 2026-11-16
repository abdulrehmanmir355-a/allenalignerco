"use client";
import { useEffect, useState } from "react";
export default function OwnerHeaderLink() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/owner/access", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal
    })
      .then((response) => {
        if (!response.ok) return { allowed: false };
        return response.json();
      })
      .then((data) => {
        setAllowed(data.allowed === true);
      })
      .catch(() => setAllowed(false));
    return () => controller.abort();
  }, []);
  if (!allowed) return null;
  return (
    <a
      data-owner-command-link="true"
      href="/owner"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "9px 15px",
        borderRadius: 9,
        background: "#113847",
        color: "#ffffff",
        fontWeight: 700,
        fontSize: 13,
        textDecoration: "none"
      }}
    >
      OWNER
    </a>
  );
}