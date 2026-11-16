"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export default function WorkspaceRefresh() {
  const router = useRouter(), [pending, startTransition] = useTransition();
  const [automatic, setAutomatic] = useState(false);
  useEffect(() => {
    if (!automatic) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") startTransition(() => router.refresh()); }, 60000);
    return () => window.clearInterval(timer);
  }, [automatic, router]);
  return <div className="workspace-refresh"><button className="button secondary small" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Refreshing…" : "Refresh overview"}</button><label><input type="checkbox" checked={automatic} onChange={e => setAutomatic(e.target.checked)}/> Update every minute</label><span role="status" className="fine-print">{pending ? "Loading current case data" : automatic ? "Automatic refresh on" : "Refresh when you need the latest data"}</span></div>;
}
