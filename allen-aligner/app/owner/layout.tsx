import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentOwner } from "../lib/owner-auth";

export const dynamic = "force-dynamic";
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const owner = await currentOwner().catch(() => null);
  if (!owner) redirect("/owner-login");
  return <><header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderBottom: "1px solid #d5e0db" }}><span>Owner Portal · {owner.ownerId}</span><form method="post" action="/api/owner/logout"><button type="submit">Sign out</button></form></header>{children}</>;
}
