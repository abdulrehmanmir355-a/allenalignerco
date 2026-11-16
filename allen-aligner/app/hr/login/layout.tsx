import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentHR } from "../../lib/hr-auth";

export default async function HRLoginLayout({ children }: { children: ReactNode }) {
  const activeHR = await currentHR().catch(() => null);
  if (activeHR) redirect("/hr/offboarding/dashboard");
  return <>{children}</>;
}
