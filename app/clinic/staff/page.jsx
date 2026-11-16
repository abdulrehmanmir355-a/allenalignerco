"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AddStaffForm from "./AddStaffForm";

export default function ClinicStaffPage() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadStaff() {
      try {
        const response = await fetch("/api/clinic/manage/staff", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Please log in to your clinic account."
              : response.status === 403
              ? "You do not have permission to view clinic staff."
              : data.error || data.message || "Unable to load staff."
          );
        }

        setStaff(Array.isArray(data.records) ? data.records : []);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Unable to load staff.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadStaff();
    return () => controller.abort();
  }, []);

  return (
    <main style={{
      maxWidth: 1100,
      margin: "40px auto",
      padding: 24,
      fontFamily: "Arial, sans-serif"
    }}>
      <Link href="/clinic/dashboard">
        ← Back to Clinic Dashboard
      </Link>

      <h1 style={{ marginTop: 30 }}>Clinic Staff Management</h1>
      <p>View staff members assigned to your clinic.</p>
      <AddStaffForm />

      {loading && <p>Loading clinic staff...</p>}

      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}

      {!loading && !error && staff.length === 0 && (
        <p>No staff members registered yet.</p>
      )}

      {!loading && !error && staff.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Name", "Email", "Designation", "Status"].map(
                  heading => (
                    <th key={heading} style={{
                      textAlign: "left",
                      padding: 12,
                      borderBottom: "1px solid #ccc"
                    }}>
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {staff.map(member => (
                <tr key={member.id}>
                  <td style={{ padding: 12 }}>{member.fullName}</td>
                  <td style={{ padding: 12 }}>{member.email}</td>
                  <td style={{ padding: 12 }}>{member.designation}</td>
                  <td style={{ padding: 12 }}>
                    {member.isActive ? "Active" : "Inactive"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

