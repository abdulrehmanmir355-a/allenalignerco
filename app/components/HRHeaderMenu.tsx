export default function HRHeaderMenu() {
  const links = [
    { label: "HR Login", href: "/hr/login" },
    { label: "HR Registration", href: "/hr/register" },
    {
      label: "HR Dashboard",
      href: "/hr/offboarding/dashboard"
    },
    {
      label: "Employee Offboarding",
      href: "/hr/offboarding"
    }
  ];

  return (
    <details style={{ position: "relative" }}>
      <summary style={{
        cursor: "pointer",
        fontWeight: 600,
        padding: "10px"
      }}>
        HR
      </summary>

      <nav style={{
        position: "absolute",
        top: "100%",
        right: 0,
        minWidth: 210,
        padding: 12,
        background: "#ffffff",
        color: "#111827",
        border: "1px solid #ddd",
        borderRadius: 8,
        zIndex: 9999,
        boxShadow: "0 4px 12px #0002"
      }}>
        {links.map(link => (
          <a
            key={link.href}
            href={link.href}
            style={{
              display: "block",
              padding: "10px",
              color: "#111827",
              textDecoration: "none"
            }}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </details>
  );
}
