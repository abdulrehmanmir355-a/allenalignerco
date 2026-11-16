
"use client";

import { useMemo, useState } from "react";

type CaseStatus =
  | "NEW_CASE"
  | "PLANNING"
  | "INTERNAL_REVIEW"
  | "DOCTOR_REVIEW"
  | "DOCTOR_APPROVED"
  | "MANUFACTURING"
  | "QC"
  | "PACKING"
  | "SHIPPED"
  | "TREATMENT"
  | "REFINEMENT"
  | "RETAINER"
  | "CLOSED";

export interface LifecycleCase {
  case_id: string;
  patient_id: string;
  clinic_id: string;
  doctor_id: string;
  status: CaseStatus;
  current_plan_version: number | null;
  doctor_approved_version: number | null;
  created_at: string;
  updated_at: string;
}

export interface LifecycleEvent {
  id: number;
  case_id: string;
  actor_id: string;
  previous_status: string;
  new_status: string;
  plan_version: number | null;
  reason: string;
  created_at: string;
}

interface Props {
  cases: LifecycleCase[];
  events: LifecycleEvent[];
}

const labels: Record<CaseStatus, string> = {
  NEW_CASE: "New Case",
  PLANNING: "Treatment Planning",
  INTERNAL_REVIEW: "Clinical Review",
  DOCTOR_REVIEW: "Doctor Review",
  DOCTOR_APPROVED: "Doctor Approved",
  MANUFACTURING: "Manufacturing",
  QC: "Quality Control",
  PACKING: "Packing",
  SHIPPED: "Shipped",
  TREATMENT: "Treatment",
  REFINEMENT: "Refinement",
  RETAINER: "Retainer",
  CLOSED: "Closed"
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  padding: 20,
  borderRadius: 12,
  border: "1px solid #e2e8f0"
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
}

export default function CaseLifecycleDashboard({
  cases,
  events
}: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return cases.filter(item => {
      const matchesSearch = [
        item.case_id,
        item.patient_id,
        item.doctor_id
      ].some(value =>
        value.toLowerCase().includes(search.toLowerCase())
      );

      return matchesSearch &&
        (status === "ALL" || item.status === status);
    });
  }, [cases, search, status]);

  const selectedCase =
    cases.find(item => item.case_id === selectedId) ??
    filtered[0] ??
    null;

  const history = useMemo(() => {
    if (!selectedCase) return [];

    return events
      .filter(e => e.case_id === selectedCase.case_id)
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
      );
  }, [events, selectedCase]);

  const counts = {
    total: cases.length,
    active: cases.filter(c => c.status !== "CLOSED").length,
    review: cases.filter(c =>
      ["INTERNAL_REVIEW", "DOCTOR_REVIEW"].includes(c.status)
    ).length,
    manufacturing: cases.filter(c =>
      ["MANUFACTURING", "QC", "PACKING"].includes(c.status)
    ).length,
    closed: cases.filter(c => c.status === "CLOSED").length
  };

  return (
    <main style={{
      padding: 24,
      background: "#f8fafc",
      minHeight: "100vh",
      color: "#0f172a"
    }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>
          Case Lifecycle Management
        </h1>
        <p style={{ color: "#64748b" }}>
          Allen Aligner — Module 07
        </p>
      </header>

      <section style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 14,
        marginBottom: 24
      }}>
        {Object.entries(counts).map(([key, value]) => (
          <div key={key} style={cardStyle}>
            <strong style={{ fontSize: 28 }}>{value}</strong>
            <p style={{
              textTransform: "capitalize",
              color: "#64748b",
              marginTop: 6
            }}>
              {key}
            </p>
          </div>
        ))}
      </section>

      <section style={cardStyle}>
        <h2 style={{ fontSize: 20, marginBottom: 18 }}>
          Case Management Queue
        </h2>

        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 18
        }}>
          <input
            aria-label="Search cases"
            placeholder="Search case, patient or doctor ID"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: "1 1 260px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: 12
            }}
          />

          <select
            aria-label="Filter case status"
            value={status}
            onChange={e => {
              setStatus(e.target.value);
              setSelectedId(null);
            }}
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: 12
            }}
          >
            <option value="ALL">All Statuses</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            textAlign: "left"
          }}>
            <thead>
              <tr>
                {[
                  "Case ID", "Patient ID", "Status",
                  "Plan Version", "Updated", "Action"
                ].map(h => (
                  <th key={h} style={{
                    padding: 12,
                    borderBottom: "1px solid #e2e8f0"
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.map(item => (
                <tr key={item.case_id}>
                  <td style={{ padding: 12 }}>{item.case_id}</td>
                  <td style={{ padding: 12 }}>{item.patient_id}</td>
                  <td style={{ padding: 12 }}>
                    {labels[item.status]}
                  </td>
                  <td style={{ padding: 12 }}>
                    {item.current_plan_version
                      ? `V${item.current_plan_version}`
                      : "Not started"}
                  </td>
                  <td style={{ padding: 12 }}>
                    {formatDate(item.updated_at)}
                  </td>
                  <td style={{ padding: 12 }}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.case_id)}
                      style={{
                        background: "#155e75",
                        color: "white",
                        border: 0,
                        padding: "9px 14px",
                        borderRadius: 7,
                        cursor: "pointer"
                      }}
                    >
                      View Case
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <p style={{ padding: 20 }}>
              No matching cases found.
            </p>
          )}
        </div>
      </section>

      {selectedCase && (
        <section style={{ ...cardStyle, marginTop: 24 }}>
          <h2 style={{ fontSize: 21, marginBottom: 14 }}>
            Case Details — {selectedCase.case_id}
          </h2>

          <p>Patient ID: {selectedCase.patient_id}</p>
          <p>Doctor ID: {selectedCase.doctor_id}</p>
          <p>Status: {labels[selectedCase.status]}</p>
          <p>
            Current Version:{" "}
            {selectedCase.current_plan_version
              ? `V${selectedCase.current_plan_version}`
              : "Not started"}
          </p>
          <p>
            Doctor Approved Version:{" "}
            {selectedCase.doctor_approved_version
              ? `V${selectedCase.doctor_approved_version}`
              : "Pending"}
          </p>

          <h3 style={{
            fontSize: 19,
            marginTop: 26,
            marginBottom: 14
          }}>
            Case Timeline
          </h3>

          {history.map(event => (
            <div key={event.id} style={{
              padding: "12px 16px",
              borderLeft: "3px solid #0891b2",
              background: "#f8fafc",
              marginBottom: 10
            }}>
              <strong>
                {event.previous_status} → {event.new_status}
              </strong>
              <p>{event.reason}</p>
              <small style={{ color: "#64748b" }}>
                {event.actor_id} · {formatDate(event.created_at)}
              </small>
            </div>
          ))}

          {history.length === 0 && (
            <p>No lifecycle events recorded.</p>
          )}
        </section>
      )}
    </main>
  );
}
