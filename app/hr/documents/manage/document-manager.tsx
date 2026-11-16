
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Doc = {
  id: string;
  originalName: string;
  documentType: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  archivedAt: string | null;
  replacedById: string | null;
};

type Audit = {
  id: string;
  documentId: string;
  originalName: string;
  action: string;
  actorId: string;
  reason: string;
  createdAt: string;
};

export default function DocumentManager({
  employeeId
}: {
  employeeId: string;
}) {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [history, setHistory] = useState<Audit[]>([]);
  const [reasons, setReasons] =
    useState<Record<string, string>>({});
  const [files, setFiles] =
    useState<Record<string, File | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch(
        "/api/hr/employee-documents/manage?employeeId=" +
          encodeURIComponent(employeeId),
        { credentials: "same-origin", cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Unable to load records"
        );
      }

      setDocuments(
        Array.isArray(data.documents) ? data.documents : []
      );

      setHistory(
        Array.isArray(data.history) ? data.history : []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load records"
      );
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function perform(
    doc: Doc,
    action: "ARCHIVE" | "RESTORE" | "REPLACE"
  ) {
    setError("");
    setMessage("");

    const reason = (reasons[doc.id] ?? "").trim();

    if (action !== "RESTORE" && reason.length < 5) {
      setError("Please enter a reason of at least 5 characters.");
      return;
    }

    if (action === "REPLACE" && !files[doc.id]) {
      setError("Select a replacement file first.");
      return;
    }

    if (
      action === "ARCHIVE" &&
      !window.confirm(
        `Archive "${doc.originalName}"?`
      )
    ) {
      return;
    }

    const form = new FormData();

    form.set("action", action);
    form.set("documentId", doc.id);
    form.set("reason", reason);

    if (action === "REPLACE" && files[doc.id]) {
      form.set("file", files[doc.id]!);
    }

    setBusy(doc.id);

    try {
      const res = await fetch(
        "/api/hr/employee-documents/manage",
        {
          method: "POST",
          body: form,
          credentials: "same-origin",
          cache: "no-store"
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || data.message || "Operation failed"
        );
      }

      setMessage(data.message);
      setReasons(prev => ({ ...prev, [doc.id]: "" }));
      setFiles(prev => ({ ...prev, [doc.id]: null }));

      await reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Document operation failed"
      );
    } finally {
      setBusy("");
    }
  }

  const buttonStyle = {
    border: 0,
    borderRadius: 8,
    padding: "10px 15px",
    color: "#ffffff",
    cursor: "pointer"
  };

  return (
    <section style={{ marginTop: 24 }}>
      <h2>Employee Documents</h2>

      <Link href={
        `/hr/documents?employeeId=${encodeURIComponent(employeeId)}`
      }>
        Upload / View Active Documents
      </Link>

      {message && (
        <p role="status" style={{
          padding: 13,
          background: "#e5f4ed",
          borderRadius: 8
        }}>
          {message}
        </p>
      )}

      {error && (
        <p role="alert" style={{
          padding: 13,
          background: "#fff0f0",
          color: "#a12626",
          borderRadius: 8
        }}>
          {error}
        </p>
      )}

      {loading && <p>Loading document records...</p>}

      {!loading && documents.length === 0 && (
        <p>No documents found for this employee.</p>
      )}

      {!loading && documents.map(doc => {
        const archived = Boolean(doc.archivedAt);

        return (
          <article key={doc.id} style={{
            background: "#ffffff",
            border: "1px solid #dce7eb",
            borderRadius: 12,
            padding: 20,
            marginTop: 16
          }}>
            <h3>{doc.originalName}</h3>

            <p>
              <strong>Type:</strong> {doc.documentType}
            </p>

            <p>
              <strong>Status:</strong>{" "}
              {archived ? "Archived" : "Active"}
            </p>

            <p>
              <strong>Uploaded:</strong>{" "}
              {new Date(doc.uploadedAt)
                .toLocaleDateString("en-GB")}
            </p>

            <label style={{ display: "block" }}>
              <strong>Reason / Comments</strong>

              <textarea
                value={reasons[doc.id] ?? ""}
                onChange={e =>
                  setReasons(prev => ({
                    ...prev,
                    [doc.id]: e.target.value
                  }))
                }
                maxLength={1000}
                rows={2}
                style={{
                  display: "block",
                  width: "100%",
                  padding: 10,
                  marginTop: 8,
                  marginBottom: 12
                }}
              />
            </label>

            {archived ? (
              <>
                {doc.replacedById && (
                  <p>
                    This is a previous version.
                    Its replacement is kept separately.
                  </p>
                )}

                <button
                  type="button"
                  disabled={busy !== "" || Boolean(doc.replacedById)}
                  onClick={() => void perform(doc, "RESTORE")}
                  style={{
                    ...buttonStyle,
                    background: "#087989"
                  }}
                >
                  Restore Document
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy !== ""}
                  onClick={() => void perform(doc, "ARCHIVE")}
                  style={{
                    ...buttonStyle,
                    background: "#874b25",
                    marginRight: 12
                  }}
                >
                  Archive
                </button>

                <div style={{ marginTop: 16 }}>
                  <label>
                    Select Replacement File (PDF / JPG / PNG)
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={e =>
                        setFiles(prev => ({
                          ...prev,
                          [doc.id]: e.target.files?.[0] ?? null
                        }))
                      }
                      style={{
                        display: "block",
                        margin: "10px 0"
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    disabled={busy !== ""}
                    onClick={() => void perform(doc, "REPLACE")}
                    style={{
                      ...buttonStyle,
                      background: "#087989"
                    }}
                  >
                    Replace Document
                  </button>
                </div>
              </>
            )}
          </article>
        );
      })}

      <h2 style={{ marginTop: 40 }}>
        Document Audit History
      </h2>

      {!loading && history.length === 0 && (
        <p>No document management actions recorded.</p>
      )}

      {history.map(item => (
        <article key={item.id} style={{
          padding: 16,
          borderBottom: "1px solid #dce7eb"
        }}>
          <strong>{item.action}</strong>
          <p>{item.originalName}</p>

          <p>
            <strong>Reason:</strong> {item.reason}
          </p>

          <p>
            <strong>HR User:</strong> {item.actorId}
          </p>

          <small>
            {new Date(item.createdAt)
              .toLocaleString("en-GB")}
          </small>
        </article>
      ))}
    </section>
  );
}
