import { redirect } from "next/navigation";
import { currentHR } from "../../../lib/hr-auth";
import SummaryClient from "./summary-client";
import styles from "./hr-overview.module.css";

export const dynamic = "force-dynamic";

export default async function HRSummaryDashboard() {
  const hr = await currentHR().catch(() => null);

  if (!hr) redirect("/hr/login");

  return (
    <main className={styles.dashboardPage}>
      <header className={styles.dashboardHero}>
        <div><p className={styles.eyebrow}>ALLEN ALIGNER · HUMAN RESOURCES</p><h1>People and operations</h1><p>One clear view of your workforce, daily workflows, and business resources.</p></div>
        <p data-aa-hr-signed-in="true" className={styles.signedIn}><span>Active HR session</span><strong>{hr.email}</strong></p>
      </header>
      <SummaryClient canManage={["HR_ADMIN", "HR_OFFICER"].includes(hr.role)} />
    </main>
  );
}
