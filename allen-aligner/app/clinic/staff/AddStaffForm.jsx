"use client";

import { useEffect, useState } from "react";

export default function AddStaffForm() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function checkRole() {
      try {
        const response = await fetch(
          "/api/clinic/permissions/me",
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal
          }
        );

        const data = await response.json();

        if (!controller.signal.aborted) {
          setIsAdmin(
            response.ok &&
            data.success === true &&
            data.role === "CLINIC_ADMIN"
          );
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setIsAdmin(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setChecking(false);
        }
      }
    }

    checkRole();
    return () => controller.abort();
  }, []);

  async function addStaff(event) {
    event.preventDefault();
    if (!isAdmin || saving) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        "/api/clinic/manage/staff",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            fullName: fullName.trim(),
            email: email.trim(),
            designation: designation.trim()
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          data.error ||
          "Unable to add staff."
        );
      }

      window.location.reload();
    } catch (err) {
      setError(err.message || "Request failed.");
      setSaving(false);
    }
  }

  if (checking || !isAdmin) return null;

  const inputStyle = {
    width: "100%",
    padding: 12,
    marginTop: 6,
    marginBottom: 16,
    border: "1px solid #ccc",
    borderRadius: 8
  };

  return (
    <section style={{
      marginTop: 24,
      padding: 24,
      border: "1px solid #ddd",
      borderRadius: 12
    }}>
      <h2>Add Clinic Staff</h2>

      <form onSubmit={addStaff}>
        <label>
          Full Name
          <input
            required
            maxLength={150}
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label>
          Email
          <input
            required
            type="email"
            maxLength={254}
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label>
          Designation
          <input
            required
            maxLength={120}
            value={designation}
            onChange={e => setDesignation(e.target.value)}
            style={inputStyle}
          />
        </label>

        {error && (
          <p role="alert" style={{ color: "crimson" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "12px 24px",
            background: "#087989",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: saving ? "wait" : "pointer"
          }}
        >
          {saving ? "Saving..." : "Add Staff"}
        </button>
      </form>
    </section>
  );
}
