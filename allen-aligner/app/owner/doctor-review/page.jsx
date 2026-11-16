"use client";

import { useEffect, useState } from "react";

export default function DoctorReview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh(signal) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/owner/doctor-review",
        { cache: "no-store", signal }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Request failed"
        );
      }

      if (!signal?.aborted) setData(result);
    } catch (err) {
      if (!signal?.aborted) {
        setError(err.message || "Connection error");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);

  return (
    <main style={{
      maxWidth: 1100,
      margin: "auto",
      padding: 30
    }}>
      <h1>Allen Aligner — Doctor Verification</h1>
      <p>Module 02 · Owner Command Center</p>

      <button
        type="button"
        disabled={loading}
        onClick={() => refresh()}
      >
        {loading ? "Loading..." : "Refresh"}
      </button>

      {error && <p role="alert">{error}</p>}

      {data && (
        <>
          <h2>Pending Doctors: {data.total}</h2>

          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse"
            }}>
              <thead>
                <tr>
                  {["Doctor", "Email", "Clinic",
                    "Registration", "Status"].map(x => (
                    <th key={x} style={{
                      padding: 12,
                      textAlign: "left",
                      borderBottom: "1px solid #ccc"
                    }}>{x}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {data.doctors.map(d => (
                  <tr key={d.id}>
                    <td>{d.fullName}</td>
                    <td>{d.email}</td>
                    <td>{d.clinicName || "—"}</td>
                    <td>{d.registrationNumber || "—"}</td>
                    <td>Pending Verification</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p>Read-only. No automatic approvals.</p>
    </main>
  );
}
