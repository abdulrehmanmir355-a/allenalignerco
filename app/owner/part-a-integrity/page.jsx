"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

export default function PartAIntegrity() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (signal) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/owner/part-a-integrity",
        { cache: "no-store", signal }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to load");
      }

      if (!signal?.aborted) {
        setData(result);
      }
    } catch (err) {
      if (!signal?.aborted) {
        setError(err.message || "Connection failed");
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const checks = data?.checks || [];

  return (
    <main style={{
      maxWidth: 1100,
      margin: "0 auto",
      padding: "32px 20px",
      minHeight: "100vh",
      background: "#f5f9fa",
      color: "#173645"
    }}>
      <Link href="/owner">
        Back to Owner Dashboard
      </Link>

      <h1>Doctor & Clinic Integrity Center</h1>

      <p>
        Allen Aligner — Part A, Modules 01, 02, 03
      </p>

      <button
        type="button"
        disabled={loading}
        onClick={() => void refresh()}
        style={{
          background: "#087989",
          color: "white",
          padding: "12px 20px",
          border: 0,
          borderRadius: 8
        }}
      >
        {loading ? "Checking..." : "Run Database Checks"}
      </button>

      {error && <p role="alert">{error}</p>}

      {data && (
        <>
          <div style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
            marginTop: 25
          }}>
            {checks.map((check) => {
              const pending =
                check.name === "Pending doctor verifications";

              const count = Number(check.count);

              return (
                <section
                  key={check.name}
                  style={{
                    background: "#fff",
                    border: "1px solid #dce7eb",
                    borderRadius: 12,
                    padding: 22
                  }}
                >
                  <p>{check.name}</p>

                  <strong style={{ fontSize: 36 }}>
                    {count}
                  </strong>

                  <p style={{
                    color: pending
                      ? "#64748b"
                      : count === 0
                        ? "#087989"
                        : "#a16207"
                  }}>
                    {pending
                      ? "Registration review queue"
                      : count === 0
                        ? "No mismatches detected"
                        : "Requires investigation"}
                  </p>
                </section>
              );
            })}
          </div>

          <p style={{
            marginTop: 22,
            color: "#64748b"
          }}>
            Checked at:{" "}
            {new Date(data.checkedAt).toLocaleString()}
          </p>
        </>
      )}

      <p style={{
        marginTop: 24,
        fontSize: 13,
        color: "#64748b"
      }}>
        Read-only checks. No patient, doctor, or clinic
        records are modified.
      </p>
    </main>
  );
}
