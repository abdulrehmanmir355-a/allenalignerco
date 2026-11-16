
"use client";

import { useEffect, useState } from "react";

type EmployeeDocument = {
  id: string;
  originalName: string;
  documentType: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
};

type Preview = {
  url: string;
  name: string;
  type: string;
};

export default function DocumentList({
  employeeId,
  refreshKey
}: {
  employeeId: string;
  refreshKey: number;
}) {
  const [documents, setDocuments] =
    useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  useEffect(() => {
    const controller = new AbortController();

    setDocuments([]);
    setPreview(null);
    setError("");
    setLoading(Boolean(employeeId));

    if (!employeeId) {
      return () => controller.abort();
    }

    async function loadDocuments() {
      try {
        const res = await fetch(
          "/api/hr/employee-documents?employeeId=" +
            encodeURIComponent(employeeId),
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal
          }
        );

        const data = await res.json();

        if (!res.ok || !Array.isArray(data.documents)) {
          throw new Error(
            data.error || "Unable to load documents"
          );
        }

        if (!controller.signal.aborted) {
          setDocuments(data.documents);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Document list unavailable"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadDocuments();

    return () => controller.abort();
  }, [employeeId, refreshKey]);

  async function accessDocument(
    doc: EmployeeDocument,
    action: "view" | "download"
  ) {
    setError("");
    setBusy(action + doc.id);

    try {
      const allowed = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ];

      if (!allowed.includes(doc.mimeType)) {
        throw new Error("Unsupported document format");
      }
      if (action === "view" && !["application/pdf", "image/jpeg", "image/png"].includes(doc.mimeType)) {
        throw new Error("This format can be downloaded but cannot be previewed here.");
      }

      const res = await fetch(
        "/api/hr/employee-documents/" +
          encodeURIComponent(doc.id),
        {
          credentials: "same-origin",
          cache: "no-store"
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || "Document access denied"
        );
      }

      const original = await res.blob();
      const blob = new Blob([original], {
        type: doc.mimeType
      });
      const url = URL.createObjectURL(blob);

      if (action === "view") {
        setPreview({
          url,
          name: doc.originalName,
          type: doc.mimeType
        });
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download =
          doc.originalName.split(/[\\/]/).pop() ||
          "employee-document";

        document.body.appendChild(link);
        link.click();
        link.remove();

        window.setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 10000);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to access document"
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ color: "#113847" }}>
        Saved Employee Documents
      </h2>

      {!employeeId && (
        <p>Select an employee first.</p>
      )}

      {loading && <p>Loading documents...</p>}

      {error && (
        <p role="alert" style={{
          background: "#fff0f0",
          color: "#a12626",
          padding: 14,
          borderRadius: 9
        }}>
          {error}
        </p>
      )}

      {employeeId && !loading && !error &&
        documents.length === 0 && (
          <p>No documents saved for this employee.</p>
        )}

      {!loading && documents.map(doc => (
        <article key={doc.id} style={{
          border: "1px solid #dce7eb",
          borderRadius: 12,
          padding: 18,
          marginBottom: 14,
          background: "#ffffff"
        }}>
          <strong>{doc.originalName}</strong>

          <p style={{ color: "#536876" }}>
            {doc.documentType} |{" "}
            {(doc.sizeBytes / 1024).toFixed(1)} KB
          </p>

          <p>
            Uploaded:{" "}
            {new Date(doc.uploadedAt)
              .toLocaleDateString("en-GB")}
          </p>

          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10
          }}>
            {["application/pdf", "image/jpeg", "image/png"].includes(doc.mimeType) && <button
              type="button"
              disabled={busy !== ""}
              onClick={() =>
                void accessDocument(doc, "view")
              }
              style={{
                background: "#113847",
                color: "#ffffff",
                padding: "11px 16px",
                border: 0,
                borderRadius: 9,
                cursor: "pointer"
              }}
            >
              {busy === "view" + doc.id
                ? "Opening..."
                : "View Document"}
            </button>}

            <button
              type="button"
              disabled={busy !== ""}
              onClick={() =>
                void accessDocument(doc, "download")
              }
              style={{
                background: "#087989",
                color: "#ffffff",
                padding: "11px 16px",
                border: 0,
                borderRadius: 9,
                cursor: "pointer"
              }}
            >
              {busy === "download" + doc.id
                ? "Downloading..."
                : "Download Document"}
            </button>
          </div>
        </article>
      ))}

      {preview && (
        <section style={{
          marginTop: 24,
          border: "1px solid #dce7eb",
          borderRadius: 12,
          padding: 16
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 16
          }}>
            <h3 style={{ margin: 0 }}>
              Preview: {preview.name}
            </h3>

            <button
              type="button"
              onClick={() => setPreview(null)}
            >
              Close
            </button>
          </div>

          {preview.type === "application/pdf" ? (
            <iframe
              title="Employee document preview"
              src={preview.url}
              sandbox="allow-scripts"
              style={{
                width: "100%",
                height: 550,
                border: "1px solid #dce7eb"
              }}
            />
          ) : (
            <img
              src={preview.url}
              alt="Employee document preview"
              style={{
                width: "100%",
                maxHeight: 550,
                objectFit: "contain"
              }}
            />
          )}
        </section>
      )}
    </section>
  );
}
