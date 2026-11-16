"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties
} from "react";
type EmployeeSummary = {
  connected: boolean;
  totalEmployees: number | null;
  activeEmployees: number | null;
  checkedAt?: string;
};
const panel: CSSProperties = {
  background: "#ffffff",
  padding: 22,
  border: "1px solid #d9e7eb",
  borderRadius: 14,
  boxShadow: "0 4px 18px rgba(17,56,71,.05)"
};
const linkStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 16px",
  border: "1px solid #d9e7eb",
  borderRadius: 10,
  color: "#113847",
  background: "#ffffff",
  textDecoration: "none",
  fontWeight: 600
};
export default function OwnerCommandCenter() {
  const [data, setData] = useState<EmployeeSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async (
    signal?: AbortSignal
  ) => {
    setBusy(true);
    try {
      const response = await fetch(
        "/api/owner/js-kpis",
        {
          credentials: "same-origin",
          cache: "no-store",
          signal
        }
      );
      if (!response.ok) throw new Error("Employee summary unavailable");
      const result = await response.json() as EmployeeSummary;
      if (!result.connected) throw new Error("Employee summary unavailable");
      if (!signal?.aborted) {
        setData(result);
      }
    } catch {
      if (!signal?.aborted) {
        setData(null);
      }
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const initialRefresh = window.setTimeout(() => {
      void refresh(controller.signal);
    }, 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh(controller.signal);
      }
    }, 60000);
    return () => {
      controller.abort();
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [refresh]);
  const total = data?.totalEmployees ?? null;
  const active = data?.activeEmployees ?? null;
  const inactive =
    total !== null && active !== null
      ? Math.max(0, total - active)
      : null;
  const metrics = [
    ["Total Employees", total],
    ["Active Employees", active],
    ["Other Employees", inactive]
  ] as const;
  return (
    <main style={{
      maxWidth: 1240,
      margin: "0 auto",
      padding: "32px 20px",
      minHeight: "100vh",
      background: "#f5f9fa",
      color: "#113847"
    }}>
      <style>{`
        .owner-command-label {
          position: relative;
          display: inline-block;
        }
        .owner-command-label::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: -4px;
          height: 2px;
          background: #087989;
          transform: scaleX(0);
          transform-origin: left center;
          transition: transform 220ms ease;
        }
        .owner-command-link:hover .owner-command-label::after,
        .owner-command-link:focus-visible .owner-command-label::after,        .owner-command-label:hover::after {
          transform: scaleX(1);
        }
        .site-footer a,
        .site-footer h3 {
          position: relative;
          display: inline-block;
        }
        .site-footer a::after,
        .site-footer h3::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: -4px;
          height: 2px;
          background: #087989;
          transform: scaleX(0);
          transform-origin: left center;
          transition: transform 220ms ease;
        }
        .site-footer a:hover::after,
        .site-footer a:focus-visible::after,
        .site-footer h3:hover::after {
          transform: scaleX(1);
        }        @media (prefers-reduced-motion: reduce) {
          .owner-command-label::after,          .site-footer a::after,          .site-footer h3::after { transition: none; }
        }
      `}</style>
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 16,
        marginBottom: 28
      }}>
        <div>
          <p className="owner-command-label" style={{
            margin: "0 0 6px",
            fontSize: 12,
            letterSpacing: 2,
            color: "#087989",
            fontWeight: 700
          }}>
            ALLEN ALIGNER
          </p>
          <h1 className="owner-command-label" style={{
            fontSize: "clamp(26px, 3vw, 36px)",
            margin: 0
          }}>
            Owner Command Center
          </h1>
        </div>
        <button
          className="owner-command-link"
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          style={{
            background: "#087989",
            border: 0,
            borderRadius: 9,
            color: "#ffffff",
            padding: "12px 18px",
            cursor: busy ? "wait" : "pointer"
          }}
        >
          <span className="owner-command-label">{busy ? "Refreshing..." : "Refresh overview"}</span>
        </button>
      </header>
      <section style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 16,
        marginBottom: 20
      }}>
        {metrics.map(([label, value]) => (
          <article key={label} style={panel}>
            <p className="owner-command-label" style={{
              margin: 0,
              color: "#64748b",
              fontSize: 14
            }}>
              {label}
            </p>
            <strong style={{
              display: "block",
              fontSize: 38,
              marginTop: 12
            }}>
              {data?.connected && value !== null
                ? value.toLocaleString()
                : "—"}
            </strong>
          </article>
        ))}
      </section>
      <section style={panel} aria-labelledby="owner-management">
          <h2 id="owner-management" className="owner-command-label">Quick links</h2>
        <nav aria-label="Owner and management links" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
          {[ 
            ['/owner/employees','Owner employee records'],['/owner/js-employees','Employee ID search'],
            ['/owner/employees/directory-live','Live employee directory'],['/owner/employees/schema','Employee database structure'],
            ['/owner/analytics','Executive analytics'],
            ['/owner/clinical/approvals','Clinical registrations and administrator appointments'],
            ['/owner/alerts','Owner alerts'],['/owner/customer-service','Customer service controls'],
            ['/owner/part-a-integrity','Data integrity'],['/owner/js-command-center','Operations command center'],
            ['/production','Laboratory access and production'],['/lab','Laboratory workspace'],
            ['/hr/employees/directory','Employee directory'],['/hr/manage/users','Accounts and permissions'],
            ['/hr/payroll','Payroll'],['/hr/documents/manage','Employee document management'],
            ['/hr/invitations','Employee invitations'],['/hr/reviewer-access','Reviewer access'],
            ['/hr/performance','Work and performance'],['/hr/assets','Assets'],
            ['/hr/offboarding/dashboard','HR operations'],['/hr/control-center','HR control center'],
            ['/quality','Quality Management'],['/quality/complaints','Complaints'],['/capa','CAPA'],
            ['/inventory','Inventory and stock'],['/hr/suppliers','Suppliers'],['/hr/manage/reports','Reports'],
            ['/hr/settings','HR settings']
          ].map(([href,label])=><Link key={href} href={href} className="owner-command-link" style={linkStyle}><span className="owner-command-label">{label}</span></Link>)}
        </nav>
      </section>
    </main>
  );
}
