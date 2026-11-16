"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export default function JSCommandCenter() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function refresh(signal) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/owner/js-kpis", {
        cache: "no-store",
        signal
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error || "Unable to load employee data"
        );
      }
      if (!signal?.aborted) setData(result);
    } catch (e) {
      if (!signal?.aborted) setError(e.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, []);
  const card = {
    background: "white",
    border: "1px solid #dce7eb",
    borderRadius: 12,
    padding: 22
  };
  return (
    <main style={{
      maxWidth: 1150,
      margin: "auto",
      padding: 30
    }}>
      <h1>Owner Command Center</h1>
      <p>JavaScript + Next.js + PostgreSQL</p>
      <button
        type="button"
        className="button"
        disabled={loading}
        onClick={() => refresh()}
      >
        {loading ? "Loading..." : "Refresh Live Data"}
      </button>
      {error && <p role="alert">{error}</p>}
      {data?.message && <p role="status">{data.message}</p>}
      <div style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 18,
        marginTop: 24
      }}>
        {[
          ["Database", data?.connected ? "Connected" : "—"],
          ["Total Employees", data?.totalEmployees ?? "—"],
          ["Active Employees", data?.activeEmployees ?? "—"]
        ].map(([label, value]) => (
          <section key={label} style={card}>
            <p>{label}</p>
            <strong style={{ fontSize: 28 }}>{value}</strong>
          </section>
        ))}
      </div>
      <section style={{ ...card, marginTop: 24 }}>
        <h2>Employee Management</h2>
        <p>
          <Link href="/owner/employees/directory-live">
            Live Employee Directory
          </Link>
        </p>
        <p>
          <Link href="/owner/js-employees">
            Employee Database · Search many IDs
          </Link>
        </p>
        <p>
          <Link href="/owner/alerts">
            Owner Alerts
          </Link>
        </p>
      </section>
      {data?.checkedAt && (
        <p>Last updated: {data.checkedAt}</p>
      )}
    </main>
  );
}
