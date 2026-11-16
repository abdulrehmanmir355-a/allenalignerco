"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function CaseTimelinePage() {
  const { id } = useParams();

  const [record, setRecord] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id || typeof id !== "string") return;

    const controller = new AbortController();

    async function loadTimeline() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/clinic/cases/${encodeURIComponent(id)}/timeline`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
            data.error ||
            "Could not load case timeline."
          );
        }

        setRecord(data.case);
        setEvents(Array.isArray(data.events) ? data.events : []);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Timeline error.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadTimeline();

    return () => controller.abort();
  }, [id]);

  return (
    <main style={{
      maxWidth: 900,
      margin: "40px auto",
      padding: 24,
      fontFamily: "Arial, sans-serif"
    }}>
      <Link href="/clinic/manage/cases">
        ← Back to Cases
      </Link>

      <h1>Case Lifecycle & Timeline</h1>
      <p>Case ID: {id}</p>

      {loading && <p>Loading timeline...</p>}

      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}

      {!loading && !error && record && (
        <>
          <h2>Current Status: {record.status}</h2>

          {events.length === 0 ? (
            <p>No timeline events recorded yet.</p>
          ) : (
            <ol style={{
              borderLeft: "3px solid #087989",
              paddingLeft: 30
            }}>
              {events.map(event => (
                <li key={event.id} style={{
                  marginBottom: 24,
                  padding: 12,
                  borderBottom: "1px solid #ddd"
                }}>
                  <strong>{event.label}</strong>
                  <p style={{ color: "#666" }}>
                    {event.createdAt
                      ? new Date(event.createdAt).toLocaleString()
                      : "Date unavailable"}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </main>
  );
}
