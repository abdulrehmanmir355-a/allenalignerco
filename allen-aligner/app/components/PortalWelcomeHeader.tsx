type Props = {
  role: "doctor" | "hr";
  name: string;
  accountId?: string;
};

export default function PortalWelcomeHeader({
  role, name, accountId
}: Props) {
  const doctor = role === "doctor";

  return (
    <header style={{
      background: "linear-gradient(125deg,#103D4B,#087989)",
      color: "#FFFFFF",
      padding: "32px",
      borderRadius: "20px",
      marginBottom: "28px",
      boxShadow: "0 12px 35px #103D4B20"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 20
      }}>
        <div>
          <p>ALLEN ALIGNER</p>
          <h1 style={{color:"#FFFFFF"}}>
            Welcome, {name}
          </h1>
          <p>
            {doctor ? "Doctor Workspace" : "HR Management"}
          </p>
        </div>
        <div style={{textAlign:"right"}}>
          <strong>{doctor ? "DOCTOR ID" : "EMPLOYEE ID"}</strong>
          <p>{accountId || "Not assigned"}</p>
        </div>
      </div>
    </header>
  );
}
