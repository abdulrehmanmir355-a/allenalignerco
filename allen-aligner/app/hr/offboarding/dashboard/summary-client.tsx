"use client";
import styles from "./hr-overview.module.css";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

type Summary = {
  employees: number;
  offboardingCases: number;
  clearances: number;
  assets: number;
  settlements: number;
};

const actionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 48,
  padding: "12px 20px",
  borderRadius: 10,
  border: "1px solid transparent",
  background: "#087989",
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "inherit",
  textDecoration: "none",
  textAlign: "center",
  cursor: "pointer",
  boxSizing: "border-box"
};

export default function SummaryClient() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/hr/offboarding/summary", {
        cache: "no-store",
        credentials: "same-origin"
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

      setData(result.summary);
    } catch (err) {
      setData(null);
      setError(
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
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
    <section
      data-allen-hr-overview="true"
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "12px 0 48px"
      }}
    >
      <h2
        style={{
          color: "#113847",
          fontSize: "clamp(26px, 3vw, 34px)",
          fontWeight: 700,
          lineHeight: 1.2,
          margin: "0 0 18px"
        }}
      >
        HR Overview
      </h2>

      <nav
        aria-label="HR Quick Actions"
        data-aa-hr-payroll-links="true"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
          marginBottom: 30
        }}
      >
        <a
          href="/hr/payroll"
          style={actionStyle}
        >
          Payroll & Salary Management
        </a>

        <a
          href="/hr/payroll/payslips"
          style={{
            ...actionStyle,
            background: "#113847"
          }}
        >
          Employee Payslips
        </a>

        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
          style={{
            ...actionStyle,
            background: "#ffffff",
            color: "#113847",
            border: "2px solid #113847",
            opacity: loading ? 0.7 : 1,
            cursor: loading ? "wait" : "pointer"
          }}
        >
          {loading ? "Refreshing..." : "Refresh Dashboard"}
        </button>
              <a
          data-aa-moved-actions="true"
          href="/hr/employees/new"
          style={actionStyle}
        >
          + Add New Employee
        </a>

        <a
          href="/hr/documents"
          style={{
            ...actionStyle,
            background: "#113847"
          }}
        >
          Employee Documents
        </a>

        <a
          href="/hr/employees/directory"
          style={{
            ...actionStyle,
            background: "#ffffff",
            color: "#113847",
            border: "2px solid #113847"
          }}
        >
          Employee Directory
        </a>
<span data-aa-employee-management-links="true" style={{display:"contents"}}><a href="/hr/employees/active" style={actionStyle}>Active Employees</a><a href="/hr/employees/inactive" style={actionStyle}>Inactive Employees</a><a href="/hr/employees/history" style={actionStyle}>Employee History</a><a href="/hr/manage/onboarding" style={actionStyle}>Employee Onboarding</a><a href="/hr/manage/offboarding" style={actionStyle}>Employee Offboarding</a></span></nav>

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

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(185px, 1fr))",
          gap: 18,
          alignItems: "stretch"
        }}
      >
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