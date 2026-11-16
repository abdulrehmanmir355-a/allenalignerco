"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
export default function OwnerJSEmployees() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [idsInput, setIdsInput] = useState("");
  const [searchIds, setSearchIds] = useState([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const load = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (searchIds.length) params.set("ids", searchIds.join(","));
      else params.set("q", search);
      const response = await fetch(
        `/api/owner/js-employees?${params}`,
        { cache: "no-store", signal }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Request failed");
      }
      if (!signal.aborted) setData(result);
    } catch (e) {
      if (!signal.aborted) {
        setError(e.message || "Unable to load employees");
        setData(null);
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [search, searchIds, page]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);
  const buttonStyle = {
    padding: "10px 16px",
    border: 0,
    borderRadius: 8,
    cursor: "pointer",
    background: "#087989",
    color: "#ffffff"
  };
  const cellStyle = {
    padding: 13,
    borderBottom: "1px solid #e2e8f0",
    textAlign: "left"
  };
  const rows = data?.rows || [];
  const total = data?.total ?? 0;
  const pages = Math.max(
    1,
    Math.ceil(total / (data?.pageSize || 25))
  );
  return (
    <main style={{
      maxWidth: 1200,
      padding: "32px 20px",
      margin: "auto",
      color: "#113847"
    }}>
      <p>
        <Link href="/owner/js-command-center">
          ← Owner Command Center
        </Link>
      </p>
      <h1>Live Employee Management</h1>
      <p>JavaScript + PostgreSQL · Owner-only · Read-only</p>
      <form
        onSubmit={e => {
          e.preventDefault();
          setPage(1);
          setSearchIds([]);
          setIdsInput("");
          setSearch(query.trim());
        }}
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          margin: "24px 0"
        }}
      >
        <input
          type="search"
          value={query}
          maxLength={60}
          placeholder="Search Employee Name or ID"
          aria-label="Search employee"
          onChange={e => setQuery(e.target.value)}
          style={{
            padding: 12,
            flex: "1 1 260px",
            border: "1px solid #cbd5e1",
            borderRadius: 8
          }}
        />
        <button style={buttonStyle} type="submit">
          Search
        </button>
        <button
          style={buttonStyle}
          type="button"
          onClick={() => setRefreshKey(n => n + 1)}
        >
          Refresh
        </button>
      </form>
      <form
        onSubmit={e => {
          e.preventDefault();
          const ids = [...new Set(idsInput.split(/[\n,;\s]+/)
            .map(value => value.trim())
            .filter(Boolean))];
          if (!ids.length) {
            setError("Enter one or more Employee IDs.");
            return;
          }
          if (ids.length > 100) {
            setError("Search up to 100 Employee IDs at a time.");
            return;
          }
          if (ids.some(id => id.length > 80)) {
            setError("Each Employee ID must be 80 characters or fewer.");
            return;
          }
          setError("");
          setQuery("");
          setSearch("");
          setPage(1);
          setSearchIds(ids);
        }}
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          margin: "0 0 24px"
        }}
      >
        <textarea
          value={idsInput}
          onChange={e => setIdsInput(e.target.value)}
          placeholder="Paste multiple Employee IDs, separated by commas or new lines"
          aria-label="Search multiple employee IDs"
          rows={3}
          style={{
            padding: 12,
            flex: "1 1 360px",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            resize: "vertical"
          }}
        />
        <button style={buttonStyle} type="submit">Find IDs</button>
        {searchIds.length > 0 && (
          <button
            style={buttonStyle}
            type="button"
            onClick={() => {
              setSearchIds([]);
              setIdsInput("");
              setPage(1);
            }}
          >Clear ID search</button>
        )}
      </form>
      {error && <p role="alert">{error}</p>}
      <p aria-live="polite">
        {loading
          ? "Loading employees..."
          : error
            ? "Unable to load records."
            : searchIds.length
              ? `${total} of ${searchIds.length} requested ID match(es)`
              : `${total} matching employee(s)`}
      </p>
      {data?.missingIds?.length > 0 && (
        <p style={{ color: "#64748b" }}>
          No record found for: {data.missingIds.join(", ")}
        </p>
      )}
      {data && (
        <>
          <p style={{ color: "#64748b" }}>
            Database Table: {data.table}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              background: "#ffffff"
            }}>
              <thead>
                <tr>
                  {[
                    "Employee ID",
                    "Employee Code",
                    "Full Name",
                    "Department",
                    "Designation",
                    "Status"
                  ].map(title => (
                    <th key={title} style={{
                      ...cellStyle,
                      background: "#eaf4f6"
                    }}>
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((person, index) => (
                  <tr key={`${person.employeeId}-${index}`}>
                    {[
                      person.employeeId,
                      person.employeeCode,
                      person.fullName,
                      person.department,
                      person.designation,
                      person.status
                    ].map((value, column) => (
                      <td key={column} style={cellStyle}>
                        {value || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 20,
            gap: 12
          }}>
            <button
              style={buttonStyle}
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage(n => n - 1)}
            >
              Previous
            </button>
            <span>Page {page} of {pages}</span>
            <button
              style={buttonStyle}
              type="button"
              disabled={page >= pages || loading}
              onClick={() => setPage(n => n + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}
