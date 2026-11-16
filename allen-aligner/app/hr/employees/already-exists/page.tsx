
import Link from "next/link";

export default function EmployeeAlreadyExists() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#f2f6f8",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24
    }}>
      <section style={{
        width: "100%",
        maxWidth: 520,
        background: "#ffffff",
        borderRadius: 18,
        padding: 36,
        textAlign: "center",
        color: "#163541",
        boxShadow: "0 12px 35px #00000012"
      }}>
        <div style={{
          fontSize: 40,
          color: "#087989",
          marginBottom: 16
        }}>
          ✓
        </div>

        <h1>Employee Already Exists</h1>

        <p style={{ lineHeight: 1.7 }}>
          An employee with these details is already
          registered in Allen Aligner HR Management.
        </p>

        <p style={{
          padding: 14,
          background: "#e9f5f4",
          borderRadius: 10
        }}>
          No duplicate employee record was created.
        </p>

        <Link
          href="/hr/employees/directory"
          style={{
            display: "block",
            background: "#087989",
            color: "#ffffff",
            padding: 14,
            borderRadius: 10,
            textDecoration: "none",
            marginTop: 22
          }}
        >
          View Employee Directory
        </Link>

        <Link
          href="/hr/employees/new"
          style={{
            display: "block",
            color: "#113847",
            padding: 14,
            marginTop: 10
          }}
        >
          Register Another Employee
        </Link>
      </section>
    </main>
  );
}
