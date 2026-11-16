import Link from "next/link";
const modules = [
  ["Executive Analytics", "/owner/analytics"],
  ["Red Alert Center", "/owner/alerts"],
  ["Employee Management", "/owner/employees"]
];
export default function OwnerHome() {
  return (
    <main style={{
      maxWidth: 1200,
      margin: "30px auto",
      padding: 24,
      color: "#113847"
    }}>
      <header style={{
        background: "#113847",
        color: "white",
        padding: 30,
        borderRadius: 14
      }}>
        <h1 style={{ color: "white", margin: 0 }}>
          ALLEN ALIGNER — OWNER COMMAND CENTER
        </h1>
        <p>Executive Management and Business Intelligence</p>
      </header>
      <h2 style={{ marginTop: 30 }}>Management Modules</h2>
      <section style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
        gap: 16
      }}>
        {modules.map(([name, url]) => (
          <Link key={url} href={url} style={{
            padding: 24,
            border: "1px solid #dce5e8",
            borderRadius: 12,
            textDecoration: "none",
            color: "#113847",
            fontWeight: 700
          }}>
            {name} →
          </Link>
        ))}
      </section>
    </main>
  );
}