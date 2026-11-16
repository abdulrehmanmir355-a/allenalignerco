import { redirect } from "next/navigation";
import { currentHR } from "../../lib/hr-auth";
import { hrRoutes } from "./routes.generated";

export const dynamic = "force-dynamic";

const groups = [
  "Employees & Identity",
  "Attendance & Performance",
  "Payroll & Finance",
  "Offboarding & Assets",
  "Other HR Modules"
] as const;

const navy = "#113847";
const teal = "#087989";

export default async function HRControlCenter() {
  const hr = await currentHR().catch(() => null);

  if (!hr) redirect("/hr/login");

  if (hr.role !== "HR_ADMIN") {
    return (
      <main style={{ padding: 40 }}>
        <h1>Access Denied</h1>
        <p>HR Administrator access is required.</p>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1320,
        margin: "30px auto",
        padding: "0 24px 60px",
        color: navy,
        boxSizing: "border-box"
      }}
    >
      <header
        style={{
          background: navy,
          color: "#ffffff",
          padding: "30px 32px",
          borderRadius: 16
        }}
      >
        <h1
          style={{
            color: "#ffffff",
            fontSize: "clamp(26px, 3vw, 40px)",
            margin: 0,
            lineHeight: 1.2
          }}
        >
          HR Master Control Center
        </h1>

        <p style={{
          color: "#ffffff",
          marginBottom: 0
        }}>
          Allen Aligner — Human Resources Management
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(200px,1fr))",
          gap: 15,
          marginTop: 24
        }}
      >
        <article style={{
          background: "#ffffff",
          padding: 22,
          borderRadius: 12,
          border: "1px solid #dce6eb"
        }}>
          <p>Available HR Pages</p>
          <strong style={{
            fontSize: 32,
            color: teal
          }}>
            {hrRoutes.length}
          </strong>
        </article>

        <article style={{
          background: "#ffffff",
          padding: 22,
          borderRadius: 12,
          border: "1px solid #dce6eb"
        }}>
          <p>HR Module Groups</p>
          <strong style={{
            fontSize: 32,
            color: teal
          }}>
            {groups.filter(group =>
              hrRoutes.some(route => route.Group === group)
            ).length}
          </strong>
        </article>
      </div>

      {groups.map(group => {
        const items = hrRoutes.filter(
          route => route.Group === group
        );

        if (!items.length) return null;

        return (
          <section
            key={group}
            style={{ marginTop: 36 }}
          >
            <h2 style={{
              color: navy,
              fontSize: 24,
              marginBottom: 18
            }}>
              {group}
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit,minmax(225px,1fr))",
                gap: 14
              }}
            >
              {items.map(route => (
                <a
                  key={route.Href}
                  href={route.Href}
                  style={{
                    minHeight: 78,
                    padding: "18px 20px",
                    boxSizing: "border-box",
                    border: "1px solid #dce6eb",
                    background: "#ffffff",
                    color: navy,
                    borderRadius: 12,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    fontWeight: 700
                  }}
                >
                  <span>{route.Label}</span>
                  <span style={{
                    color: teal,
                    fontSize: 22
                  }}>
                    →
                  </span>
                </a>
              ))}
            </div>
          </section>
        );
      })}

      <p style={{
        marginTop: 40,
        color: "#64748b",
        fontSize: 13
      }}>
        Pages are discovered from existing HR routes.
        Access to each module remains subject to
        its own authorization and permissions.
      </p>
    </main>
  );
}