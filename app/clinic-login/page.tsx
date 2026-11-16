import Link from "next/link";
import { redirect } from "next/navigation";
import { currentClinic } from "../lib/clinic-auth";
import PortalForm from "../components/portal-form";
export default async function ClinicLoginPage() {
  if (await currentClinic()) {
    redirect("/clinic/dashboard");
  }
  return (
    <main
      style={{
        width: "min(1200px, calc(100% - 32px))",
        margin: "28px auto 48px",
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
        gap: 28,
        alignItems: "stretch",
      }}
    >
      <aside
        style={{
          background: "#e5ede5",
          borderRadius: 18,
          padding: "clamp(24px, 4vw, 48px)",
          minHeight: 540,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          color: "#103746",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              marginBottom: 48,
            }}
          >
            THE ALLEN ALIGNER NETWORK · CLINIC
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
            Your clinic.
            <br />
            A clearer
            <br />
            <em>connection.</em>
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.8,
              marginTop: 32,
            }}
          >
            One connected workspace for patients, doctors,
            appointments and clinical cases.
          </p>
          <div
            style={{
              display: "grid",
              gap: 18,
              marginTop: 42,
              fontSize: 13,
            }}
          >
            <p>01　 Secure clinic access</p>
            <p>02　 Patient management</p>
            <p>03　 Doctors and cases</p>
            <p>04　 Appointments and records</p>
          </div>
        </div>
        <Link
          href="/how-it-works"
          style={{
            marginTop: 36,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          See how it works →
        </Link>
      </aside>
      <section
        style={{
          background: "#ffffff",
          border: "1px solid #d5e0db",
          borderRadius: 18,
          padding: "clamp(24px, 4vw, 48px)",
          minHeight: 540,
          color: "#103746",
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 2,
            marginBottom: 22,
          }}
        >
          CLINIC ACCESS
        </p>
        <h2
          style={{
            fontSize: "clamp(32px, 3vw, 44px)",
            lineHeight: 1.15,
            letterSpacing: "-0.04em",
            marginBottom: 16,
          }}
        >
          Welcome back.
        </h2>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            marginBottom: 35,
          }}
        >
          Enter your credentials to access your clinic workspace.
        </p>
        <PortalForm
          action="/api/clinic/auth/login"
          label="Sign in →"
        >
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              placeholder="clinic@example.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={1}
              maxLength={72}
              required
              placeholder="Enter your password"
            />
          </label>
        </PortalForm>
        <p
          className="fine-print"
          style={{ marginTop: 26 }}
        >
          Authorized clinic personnel only.
          Access to patient records is permission-controlled.
        </p>
        <p
          className="auth-switch"
          style={{ marginTop: 22 }}
        >
          New to Allen Aligner?{" "}
          <Link href="/clinic-register">
            Register your clinic
          </Link>
        </p>
      </section>
    </main>
  );
}