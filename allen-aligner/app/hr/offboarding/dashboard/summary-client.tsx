"use client";
import styles from "./hr-overview.module.css";

import { useEffect, useRef, useState } from "react";

type Summary = {
  employees: number;
  offboardingCases: number;
  clearances: number;
  assets: number;
  settlements: number;
};

export default function SummaryClient({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false);
  const requestController = useRef<AbortController | null>(null);

  async function refresh() {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/hr/offboarding/summary", {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "HR login required."
            : `Dashboard API error: ${res.status}`
        );
      }

      const result = await res.json();

      if (!result.success || !result.summary) {
        throw new Error("Invalid dashboard response.");
      }

      if (!controller.signal.aborted && mounted.current) setData(result.summary);
    } catch (err) {
      if (controller.signal.aborted || !mounted.current) return;
      setData(null);
      setError(
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      if (!controller.signal.aborted && mounted.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      requestController.current?.abort();
    };
  }, []);

  const cards: { label: string; value: number }[] = data
    ? [
        { label: "Total Employees", value: data.employees },
        { label: "Offboarding Cases", value: data.offboardingCases },
        { label: "Clearance Records", value: data.clearances },
        { label: "Asset Records", value: data.assets },
        { label: "Final Settlements", value: data.settlements }
      ]
    : [];

  return (
    <section data-allen-hr-overview="true" className={styles.overview}>
      <div className={styles.overviewHeading}>
        <div><p className={styles.eyebrow}>AT A GLANCE</p><h2>Workforce overview</h2><p>Live counts from your HR records and operational registers.</p></div>
        <button type="button" disabled={loading} onClick={() => void refresh()} className={styles.refreshButton}>
          {loading ? "Refreshing…" : "Refresh overview"}
        </button>
      </div>

      <nav aria-label="HR workspace shortcuts" data-aa-hr-payroll-links="true" className={styles.shortcutGroups}>
        <section className={styles.shortcutGroup}>
          <p className={styles.eyebrow}>PEOPLE</p><h3>Employees and records</h3>
          <div className={styles.shortcutLinks}>
            <a href="/hr/employees/directory">Employee directory <span>Search and manage profiles</span></a>
            {canManage && <a href="/hr/employees/new" data-aa-moved-actions="true">Add employee <span>Create a staff record</span></a>}
            <a href="/hr/employees/active">Active employees <span>Current team members</span></a>
            <a href="/hr/employees/inactive">Inactive employees <span>Former and inactive staff</span></a>
            <a href="/hr/employees/history">Employee history <span>Changes and audit events</span></a>
            <a href="/hr/documents">Employee documents <span>Secure personnel files</span></a>
          </div>
        </section>
        <section className={styles.shortcutGroup}>
          <p className={styles.eyebrow}>EMPLOYEE EXPERIENCE</p><h3>People workflows</h3>
          <div className={styles.shortcutLinks}>
            <a href="/hr/manage/onboarding">Onboarding <span>Prepare new starters</span></a>
            <a href="/hr/manage/offboarding">Offboarding <span>Manage employee exits</span></a>
            <a href="/hr/manage/attendance">Attendance <span>Review attendance records</span></a>
            <a href="/hr/manage/leave">Leave <span>Track leave requests</span></a>
            <a href="/hr/performance">Work and performance <span>Employee goals and reviews</span></a>
          </div>
        </section>
        <section className={styles.shortcutGroup}>
          <p className={styles.eyebrow}>BUSINESS OPERATIONS</p><h3>Resources and payroll</h3>
          <div className={styles.shortcutLinks}>
            <a href="/hr/payroll">Payroll management <span>Salary and payroll records</span></a>
            <a href="/hr/payroll/payslips">Employee payslips <span>Published pay statements</span></a>
            <a href="/inventory">Inventory control <span>Stock and supply operations</span></a>
            <a href="/hr/suppliers">Supplier management <span>Supplier records and activity</span></a>
            <a href="/hr/manage/assets">Assets <span>Assigned workplace equipment</span></a>
            <a href="/hr/manage/clearance">Clearance <span>Exit clearance records</span></a>
          </div>
        </section>
        <section className={styles.shortcutGroup}>
          <p className={styles.eyebrow}>ACCESS AND QUALITY</p><h3>Governance</h3>
          <div className={styles.shortcutLinks}>
            <a href="/hr/access">Invitations and access <span>Manage account access</span></a>
            {canManage && <><a href="/quality/risks">Risk management <span>Review the HR-managed risk register</span></a><a href="/production">Production and Lab access <span>Manage case-specific Lab grants</span></a><a href="/hr/doctor-verification">Doctor verification <span>Review professional records</span></a></>}
            <a href="/hr/manage/reports">HR reports <span>People and operations reporting</span></a>
          </div>
        </section>
      </nav>

      {error && (
        <p
          role="alert"
          style={{
            color: "#a12626",
            background: "#fff2f2",
            padding: 14,
            borderRadius: 8,
            marginBottom: 20
          }}
        >
          {error}
        </p>
      )}

      {loading && !data && (
        <p role="status">Loading HR statistics...</p>
      )}

      <div className={styles.metricsGrid}>
        {cards.map(card => (
  <article
    key={card.label}
    className={styles.statCard}
  >
    <div className={styles.statLabel}>
      {card.label}
    </div>
    <div className={styles.statValue}>
      {card.value}
    </div>
  </article>
))}
      </div>
    </section>
  );
}
