"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function FinanceLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/hr/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message || "Unable to sign in.");
        return;
      }
      window.location.assign("/finance");
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "64px auto", padding: 32 }}>
      <p>ALLEN ALIGNER · FINANCE</p>
      <h1>Sign in to payroll</h1>
      <p>Use your active HR account. Payroll access is controlled by your HR role.</p>
      <form onSubmit={signIn} style={{ display: "grid", gap: 16 }}>
        <label>
          Email address
          <input
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            maxLength={72}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p style={{ marginTop: 20 }}>
        <Link href="/hr/login">Go to HR sign in</Link>
      </p>
    </main>
  );
}
