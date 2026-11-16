
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AddPatientPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [patientReference, setPatientReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function savePatient(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (saving) return;

    setError("");
    setSuccess("");

    const name = fullName.trim();
    const reference = patientReference.trim();

    if (name.length < 2) {
      setError("Enter a valid patient name.");
      return;
    }

    if (!reference) {
      setError("Enter a patient reference.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        "/api/clinic/patients/register",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fullName: name,
            patientReference: reference,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message ||
          data.error ||
          "Patient could not be saved."
        );
      }

      setSuccess("Patient saved successfully.");

      router.push("/clinic/patient-master");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Patient registration failed."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main
      className="container section"
      style={{
        maxWidth: 700,
        margin: "0 auto",
        padding: 24,
      }}
    >
      <Link href="/clinic/patient-master">
        ← Back to Patient Master
      </Link>

      <header style={{ margin: "28px 0" }}>
        <p style={{ color: "#087989", fontWeight: 700 }}>
          ALLEN ALIGNER | MODULE 04
        </p>

        <h1>Add New Patient</h1>

        <p>
          Register a patient under your
          authorized clinic account.
        </p>
      </header>

      <form onSubmit={savePatient}>
        <label
          htmlFor="fullName"
          style={{ display: "block", marginBottom: 8 }}
        >
          Patient Full Name *
        </label>

        <input
          id="fullName"
          type="text"
          required
          minLength={2}
          maxLength={150}
          autoComplete="off"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Enter patient's full name"
          style={{
            display: "block",
            width: "100%",
            padding: 14,
            marginBottom: 22,
            border: "1px solid #aaa",
            borderRadius: 8,
          }}
        />

        <label
          htmlFor="patientReference"
          style={{ display: "block", marginBottom: 8 }}
        >
          Clinic Patient Reference *
        </label>

        <input
          id="patientReference"
          type="text"
          required
          maxLength={100}
          autoComplete="off"
          value={patientReference}
          onChange={(e) =>
            setPatientReference(e.target.value)
          }
          placeholder="Your clinic's patient reference"
          style={{
            display: "block",
            width: "100%",
            padding: 14,
            marginBottom: 22,
            border: "1px solid #aaa",
            borderRadius: 8,
          }}
        />

        <p style={{ color: "#666", fontSize: 14 }}>
          The permanent patient ID must be
          generated and validated by the database.
        </p>

        {error && (
          <p role="alert" style={{ color: "crimson" }}>
            {error}
          </p>
        )}

        {success && (
          <p role="status" style={{ color: "green" }}>
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            background: "#087989",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "14px 24px",
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? "Saving Patient..." : "Save Patient"}
        </button>
      </form>
    </main>
  );
}
