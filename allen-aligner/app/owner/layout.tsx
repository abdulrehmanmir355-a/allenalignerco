import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentOwner } from "../lib/owner-auth";

export const dynamic = "force-dynamic";
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const owner = await currentOwner().catch(() => null);
  if (!owner) redirect("/owner-login");
  return <><header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, minHeight: 64, padding: "10px clamp(16px, 4vw, 40px)", borderBottom: "1px solid #d5e0db", background: "#fff", color: "#113847", boxSizing: "border-box" }}><span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: 14 }}><strong>Owner Portal</strong><span aria-hidden="true" style={{ color: "#9aafb4" }}>·</span><span style={{ color: "#527078", overflowWrap: "anywhere" }}>{owner.ownerId}</span></span><form method="post" action="/api/owner/logout" style={{ margin: 0, flex: "0 0 auto" }}><button type="submit" style={{ border: "1px solid #c7d9dc", borderRadius: 8, background: "#fff", color: "#113847", padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Sign out</button></form></header>{children}</>;
}
