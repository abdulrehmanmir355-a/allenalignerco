"use client";
import { Suspense, useState, type FormEvent, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
const card: CSSProperties = {
  borderRadius: 18,
  padding: "clamp(24px, 4vw, 48px)",
  minWidth: 0,
};
function LoginForm() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ownerMode = pathname === "/owner-login" || searchParams.get("portal") === "owner";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch(ownerMode ? "/api/owner/login" : "/api/hr/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ownerMode ? { ownerId: email, password } : { email, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message || "Login unsuccessful.");
        return;
      }
      const requestedDestination = searchParams.get("next");
      const allowedDestination = !ownerMode && requestedDestination === "/quality/risks" ? requestedDestination : null;
      window.location.assign(allowedDestination || result.redirectTo || (ownerMode ? "/owner/command-center" : "/hr/offboarding/dashboard"));
    } catch {
      setError(ownerMode ? "Owner sign-in is temporarily unavailable." : "Unable to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main
      style={{
        width: "min(1200px, 100%)",
        margin: "0 auto",
        padding: "28px 16px 48px",
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
        gap: 28,
        alignItems: "stretch",
      }}
    >
      <section
        style={{
          ...card,
          background: "#e5ede5",
          color: "#103746",
          minHeight: 560,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              marginBottom: 50,
            }}
          >
            THE ALLEN ALIGNER NETWORK · {ownerMode ? "OWNER" : "HR"}
          </p>
          <h1
            style={{
              fontSize: "clamp(38px, 4vw, 58px)",
              lineHeight: 1.13,
              letterSpacing: "-0.045em",
              fontWeight: 650,
              margin: 0,
            }}
          >
            People first.
            <br />
            Operations
            <br />
            simplified.
          </h1>
          <p
            style={{
              marginTop: 34,
              lineHeight: 1.8,
              fontSize: 15,
            }}
          >
            A thoughtful digital workspace for your
            people and operations.
          </p>
          <div
            style={{
              marginTop: 45,
              display: "grid",
              gap: 18,
              fontSize: 13,
            }}
          >
            <p>01　 Secure {ownerMode ? "Owner" : "HR"} access</p>
            <p>02　 {ownerMode ? "Owner Command Center" : "Employee management"}</p>
            <p>03　 {ownerMode ? "Business oversight" : "Work and performance"}</p>
            <p>04　 {ownerMode ? "Company operations" : "Onboarding and offboarding"}</p>
          </div>
        </div>
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: "#103746",
            marginTop: 35,
          }}
        >
          Back to Allen Aligner →
        </Link>
      </section>
      <section
        style={{
          ...card,
          background: "#ffffff",
          border: "1px solid #d5e0db",
          color: "#103746",
          minHeight: 560,
        }}
      >
        <p
          style={{
            fontSize: 11,
            letterSpacing: 2,
            fontWeight: 700,
            marginBottom: 22,
          }}
        >
          {ownerMode ? "OWNER ACCESS" : "HR ACCESS"}
        </p>
        <h2
          style={{
            fontSize: "clamp(32px, 3vw, 44px)",
            lineHeight: 1.15,
            marginBottom: 16,
            letterSpacing: "-0.04em",
          }}
        >
          {ownerMode ? "Owner sign in." : "Welcome back."}
        </h2>
        <p style={{ marginBottom: 38, lineHeight: 1.7 }}>
          {ownerMode ? "Use the Owner ID issued after your invitation-only registration." : "Enter your details to verify your HR credentials."}
        </p>
        <form className="form-stack" onSubmit={login}>
          <label htmlFor={ownerMode ? "owner-id" : "hr-email"}>
            {ownerMode ? "Owner ID" : "Email address"}
            <input
              id={ownerMode ? "owner-id" : "hr-email"}
              type={ownerMode ? "text" : "email"}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder={ownerMode ? "Enter your Owner ID" : "hr@example.com"}
              autoCapitalize={ownerMode ? "off" : undefined}
              spellCheck={ownerMode ? false : undefined}
            />
          </label>
          <label htmlFor="hr-password">
            Password
            <div className="password-field">
              <input
                id="hr-password"
                type={show ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
              />
              <button
                type="button"
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
                onClick={() => setShow(!show)}
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          {error && (
            <p role="alert" style={{ color: "#b42318" }}>
              {error}
            </p>
          )}
          <button
            className="button full"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in..." : ownerMode ? "Sign in to Owner Portal →" : "Sign in →"}
          </button>
        </form>
        <p className="fine-print" style={{ marginTop: 24 }}>
          {ownerMode ? "Owner access requires an HR-issued registration code." : "Authorized HR personnel only. Your HR workspace is protected by secure authentication."}
        </p>
        {ownerMode ? <><p className="auth-switch" style={{ marginTop: 20 }}>Forgot your Owner password? <Link href="/owner-password-reset">Use an HR reset code</Link></p><p className="auth-switch">Need an Owner account? <Link href="/owner-register">Register with an HR code</Link></p><p className="auth-switch"><Link href="/hr/login">HR sign in</Link></p></> : <p className="auth-switch" style={{ marginTop: 20 }}>Need HR access? <Link href="/hr/register">HR Registration</Link></p>}
      </section>
    </main>
  );
}

export default function HRLoginPage() {
  return <Suspense fallback={<main style={{ padding: 32 }}>Loading sign-in…</main>}><LoginForm /></Suspense>;
}
