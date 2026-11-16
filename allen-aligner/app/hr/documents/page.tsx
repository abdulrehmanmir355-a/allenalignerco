
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import DocumentList from "./document-list";

type Employee = {
  id: string;
  employeeCode: string;
  fullName: string;
  department: string;
};

export default function HRDocumentsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [documentType, setDocumentType] = useState("CV");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fileKey, setFileKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadEmployees() {
      try {
        const res = await fetch("/api/hr/employees", {
          credentials: "same-origin",
          cache: "no-store"
        });

        const data = await res.json();

        if (!res.ok || !Array.isArray(data.employees)) {
          throw new Error(
            data.error || "Employee list unavailable"
          );
        }

        if (active) {
          setEmployees(data.employees);
          const requestedEmployeeId = new URLSearchParams(window.location.search).get("employeeId");
          if (requestedEmployeeId && data.employees.some((employee: Employee) => employee.id === requestedEmployeeId)) {
            setEmployeeId(requestedEmployeeId);
          }
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load employees"
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadEmployees();

    return () => {
      active = false;
    };
  }, []);

  async function uploadDocument(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!employeeId || !file) {
      setError("Select an employee and a document.");
      return;
    }

    if (
      file.size === 0 ||
      file.size > 10 * 1024 * 1024
    ) {
      setError(
        "Document must be between 1 byte and 10 MB."
      );
      return;
    }

    const form = new FormData();
    form.append("employeeId", employeeId);
    form.append("documentType", documentType);
    form.append("file", file);

    setUploading(true);

    try {
      const res = await fetch(
        "/api/hr/employee-documents",
        {
          method: "POST",
          credentials: "same-origin",
          body: form
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Upload failed"
        );
      }

      setSuccess(
        "Employee document uploaded successfully."
      );

      setFile(null);

      // Refresh uploaded documents after success
      setFileKey(value => value + 1);

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Document upload failed"
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "40px auto",
        padding: 28,
        background: "#ffffff",
        borderRadius: 18,
        color: "#183643"
      }}
    >
      <Link href="/hr/offboarding/dashboard">
        Back to HR Dashboard
      </Link>

      <h1>Employee Documents</h1>

      <p>
        Allen Aligner - HR Document Management
      </p>

      <form
        onSubmit={uploadDocument}
        style={{
          display: "grid",
          gap: 20,
          marginTop: 28
        }}
      >
        <label>
          Select Employee

          <select
            value={employeeId}
            onChange={e =>
              setEmployeeId(e.target.value)
            }
            required
            disabled={loading || uploading}
            style={{
              display: "block",
              width: "100%",
              padding: 12
            }}
          >
            <option value="">
              {loading
                ? "Loading employees..."
                : "Choose Employee"}
            </option>

            {employees.map(employee => (
              <option
                key={employee.id}
                value={employee.id}
              >
                {employee.employeeCode}
                {" - "}
                {employee.fullName}
              </option>
            ))}
          </select>
        </label>

        <label>
          Document Type

          <select
            value={documentType}
            onChange={e =>
              setDocumentType(e.target.value)
            }
            disabled={uploading}
            style={{
              display: "block",
              width: "100%",
              padding: 12
            }}
          >
            <option value="CV">
              CV / Resume
            </option>

            <option value="CNIC">
              CNIC / Identity Document
            </option>

            <option value="CONTRACT">
              Employment Contract
            </option>

            <option value="CERTIFICATE">
              Educational Certificate
            </option>

            <option value="OTHER">
              Other Document
            </option>
          </select>
        </label>

        <label>
          Choose Document

          <input
            key={fileKey}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx"
            required
            disabled={uploading}
            onChange={e =>
              setFile(e.target.files?.[0] ?? null)
            }
            style={{
              display: "block",
              marginTop: 10
            }}
          />
        </label>

        <p>
          Accepted: PDF, JPG, PNG, DOC, DOCX, XLSX.
          Maximum size: 10 MB.
        </p>

        {error && (
          <p
            role="alert"
            style={{ color: "#b42318" }}
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            style={{ color: "#087989" }}
          >
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={
            uploading ||
            loading ||
            !employeeId ||
            !file
          }
          style={{
            background: "#087989",
            color: "white",
            padding: 15,
            border: 0,
            borderRadius: 10,
            cursor: "pointer"
          }}
        >
          {uploading
            ? "Uploading Document..."
            : "Upload Document"}
        </button>
      </form>

      {/* Employee Documents List and Download */}

      <DocumentList
        employeeId={employeeId}
        refreshKey={fileKey}
      />

    </main>
  );
}
