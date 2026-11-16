"use client";

import { useCallback, useEffect, useState } from "react";

type Employee = {
  id: string;
  employeeCode: string;
  fullName: string;
};

type Asset = {
  id: string;
  assetCode: string;
  assetName: string;
  serialNumber: string | null;
  status: string;
};

export default function AssetRegister({
  employees
}: {
  employees: Employee[];
}) {
  const [employeeId, setEmployeeId] =
    useState(employees[0]?.id ?? "");

  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetName, setAssetName] = useState("");
  const [serial, setSerial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!employeeId) {
      setAssets([]);
      return;
    }

    const res = await fetch(
      "/api/hr/assets?employeeId=" +
        encodeURIComponent(employeeId),
      { cache: "no-store" }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Unable to load assets");
    }

    setAssets(data.assets ?? []);
  }, [employeeId]);

  useEffect(() => {
    setAssets([]);
    setError("");
    setMessage("");

    void load().catch(e => setError(e.message));
  }, [load]);

  async function submit(
    action: "ISSUE" | "RETURN",
    assetId?: string
  ) {
    if (busy) return;

    if (
      action === "RETURN" &&
      !window.confirm("Confirm physical return of this asset?")
    ) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/hr/assets", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          employeeId,
          assetName,
          serialNumber: serial,
          assetId
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Operation failed");
      }

      setMessage(
        data.assetCode
          ? data.message + " — " + data.assetCode
          : data.message
      );

      setAssetName("");
      setSerial("");

      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Operation failed"
      );
    } finally {
      setBusy(false);
    }
  }

  const btn = {
    background: "#087989",
    color: "#ffffff",
    border: 0,
    padding: "11px 16px",
    borderRadius: 9,
    cursor: "pointer"
  };

  return (
    <section style={{ padding: 20 }}>
      <h2>Select Employee</h2>

      <select
        value={employeeId}
        onChange={e => setEmployeeId(e.target.value)}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 8
        }}
      >
        {employees.length === 0 && (
          <option value="">No employees found</option>
        )}
        {employees.map(e => (
          <option key={e.id} value={e.id}>
            {e.employeeCode} — {e.fullName}
          </option>
        ))}
      </select>

      {error && (
        <p role="alert" style={{ color: "#a12626" }}>
          {error}
        </p>
      )}

      {message && (
        <p role="status" style={{ color: "#087989" }}>
          {message}
        </p>
      )}

      <h2 style={{ marginTop: 28 }}>Issued Assets</h2>

      {assets.length === 0 && (
        <p>
          No assets recorded in this register.
          Verify older registers before confirming
          that no assets were issued.
        </p>
      )}

      {assets.map(asset => (
        <article key={asset.id} style={{
          background: "#ffffff",
          border: "1px solid #dce7eb",
          padding: 16,
          marginBottom: 12,
          borderRadius: 10
        }}>
          <strong>{asset.assetCode}</strong>

          <p>{asset.assetName}</p>

          {asset.serialNumber && (
            <p>Serial: {asset.serialNumber}</p>
          )}

          <p>Status: {asset.status}</p>

          {asset.status === "ISSUED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void submit("RETURN", asset.id)
              }
              style={btn}
            >
              Confirm Asset Returned
            </button>
          )}
        </article>
      ))}

      <h2 style={{ marginTop: 30 }}>
        Issue New Asset
      </h2>

      <label style={{ display: "block", marginBottom: 12 }}>
        Asset Name
        <input
          value={assetName}
          onChange={e => setAssetName(e.target.value)}
          placeholder="Laptop / Mobile / Tools"
          maxLength={150}
          style={{
            display: "block",
            width: "100%",
            padding: 12
          }}
        />
      </label>

      <label style={{ display: "block", marginBottom: 14 }}>
        Serial Number (Optional)
        <input
          value={serial}
          onChange={e => setSerial(e.target.value)}
          maxLength={100}
          style={{
            display: "block",
            width: "100%",
            padding: 12
          }}
        />
      </label>

      <button
        type="button"
        style={btn}
        disabled={
          busy ||
          !employeeId ||
          assetName.trim().length < 2
        }
        onClick={() => void submit("ISSUE")}
      >
        Save Asset — Generate Code Automatically
      </button>
    </section>
  );
}