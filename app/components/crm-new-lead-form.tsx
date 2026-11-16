
"use client";

import { useState, type FormEvent } from "react";

export default function CrmNewLeadForm() {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (saving) return;

    const form = event.currentTarget;
    const data = new FormData(form);

    const lead = {
      lead_name: String(data.get("lead_name") || "").trim(),
      customer_type: String(data.get("customer_type") || ""),
      company_name: String(data.get("company_name") || "").trim(),
      country: String(data.get("country") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      lead_source: String(data.get("lead_source") || "").trim(),
      notes: String(data.get("notes") || "").trim(),
    };

    if (!lead.lead_name) {
      setMessage("Lead name is required.");
      return;
    }

    setSaving(true);
    setSuccess(false);
    setMessage("");

    try {
      const response = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
      });

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "CRM API is not connected yet."
            : `Unable to save lead (HTTP ${response.status}).`
        );
      }

      setSuccess(true);
      setMessage("Lead saved successfully.");
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save lead."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel padded">
      <h2>Add New CRM Lead</h2>
      <p>Register a doctor, clinic or dental laboratory.</p>

      <form onSubmit={handleSubmit}>
        <label>
          Lead Name *
          <input name="lead_name" required maxLength={200} />
        </label>

        <label>
          Customer Type *
          <select name="customer_type" required>
            <option value="DOCTOR">Doctor</option>
            <option value="CLINIC">Clinic</option>
            <option value="LAB">Dental Laboratory</option>
          </select>
        </label>

        <label>
          Company / Clinic Name
          <input name="company_name" maxLength={200} />
        </label>

        <label>
          Country
          <input name="country" maxLength={100} />
        </label>

        <label>
          Email
          <input name="email" type="email" maxLength={200} />
        </label>

        <label>
          Phone
          <input name="phone" type="tel" maxLength={60} />
        </label>

        <label>
          Lead Source
          <select name="lead_source">
            <option value="">Select source</option>
            <option value="WEBSITE">Website</option>
            <option value="EXHIBITION">Exhibition</option>
            <option value="REFERRAL">Referral</option>
            <option value="EMAIL">Email</option>
            <option value="DIRECT">Direct Contact</option>
            <option value="OTHER">Other</option>
          </select>
        </label>

        <label>
          Notes
          <textarea name="notes" maxLength={4000} rows={4} />
        </label>

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Lead"}
        </button>

        {message && (
          <p role="status" aria-live="polite">
            {success ? "✓ " : ""}
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
