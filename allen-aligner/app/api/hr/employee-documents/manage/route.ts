
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { currentHR } from "../../../../lib/hr-auth";
import { db } from "../../../../lib/database";
import { validateHRDocument } from "../../../../lib/hr-document-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DocumentRow = {
  id: string;
  employeeId: string;
  documentType: string;
  archivedAt: string | null;
  replacedById: string | null;
};

async function admin() {
  const hr = await currentHR().catch(() => null);
  return hr?.role === "HR_ADMIN" && hr.id ? hr : null;
}

function error(message: string, status: number) {
  return Response.json(
    { success: false, error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: Request) {
  const hr = await admin();
  if (!hr) return error("HR Administrator required", 403);

  const employeeId = new URL(request.url).searchParams
    .get("employeeId") ?? "";

  if (!uuidPattern.test(employeeId)) {
    return error("Invalid Employee ID", 400);
  }

  try {
    const history = await db.query(
      `SELECT a."id", a."documentId", a."action",
              a."actorId", a."reason", a."createdAt",
              d."originalName"
       FROM "EmployeeDocumentAudit" a
       JOIN "EmployeeDocument" d
         ON d."id" = a."documentId"
       WHERE d."employeeId" = $1
       ORDER BY a."createdAt" DESC
       LIMIT 100`,
      [employeeId]
    );

    const documents = await db.query(
      `SELECT "id", "originalName", "documentType",
              "mimeType", "sizeBytes", "uploadedAt",
              "archivedAt", "replacedById"
       FROM "EmployeeDocument"
       WHERE "employeeId" = $1
       ORDER BY "uploadedAt" DESC
       LIMIT 200`,
      [employeeId]
    );
    return Response.json(
      { success: true, history, documents },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return error("Document audit history unavailable", 503);
  }
}

export async function POST(request: Request) {
  const hr = await admin();
  if (!hr) return error("HR Administrator required", 403);

  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(request.url).origin) {
    return error("Invalid request origin", 403);
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return error("Invalid form", 400);
  }

  const action = String(form.get("action") ?? "");
  const documentId = String(form.get("documentId") ?? "");
  const reason = String(form.get("reason") ?? "").trim();

  if (!["ARCHIVE", "RESTORE", "REPLACE"].includes(action)) {
    return error("Invalid document action", 400);
  }

  if (!uuidPattern.test(documentId)) {
    return error("Invalid document ID", 400);
  }

  if (
    reason.length > 1000 ||
    (action !== "RESTORE" && reason.length < 5)
  ) {
    return error("Enter a valid reason", 400);
  }

  let replacement:
    | { bytes: Buffer; extension: string; name: string; mime: string }
    | null = null;

  if (action === "REPLACE") {
    const file = form.get("file");

    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 10 * 1024 * 1024
    ) {
      return error("Select a file up to 10 MB", 400);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const validated = validateHRDocument(file.name, bytes);
    if (!validated) return error("Choose a valid PDF, JPG, PNG, DOC, DOCX or XLSX file", 400);

    replacement = {
      bytes,
      extension: validated.extension,
      name: file.name.replace(/[\\/]/g, "_").slice(0, 180),
      mime: validated.mimeType
    };
  }

  let writtenFile: string | null = null;

  try {
    const outcome = await db.transaction(async (tx) => {
      const rows = await tx.query(
        `SELECT "id", "employeeId", "documentType",
                "archivedAt", "replacedById"
         FROM "EmployeeDocument"
         WHERE "id" = $1
         FOR UPDATE`,
        [documentId]
      ) as DocumentRow[];

      if (!rows.length) {
        return { success: false, message: "Document not found" };
      }

      const old = rows[0];

      if (action === "ARCHIVE") {
        if (old.archivedAt) {
          return { success: false, message: "Already archived" };
        }

        await tx.query(
          `UPDATE "EmployeeDocument"
           SET "archivedAt" = NOW(),
               "archivedBy" = $2
           WHERE "id" = $1`,
          [documentId, String(hr.id)]
        );

        await tx.query(
          `INSERT INTO "EmployeeDocumentAudit"
           ("documentId", "action", "actorId", "reason")
           VALUES ($1, 'ARCHIVED', $2, $3)`,
          [documentId, String(hr.id), reason]
        );

        return { success: true, message: "Document archived" };
      }

      if (action === "RESTORE") {
        if (!old.archivedAt || old.replacedById) {
          return {
            success: false,
            message: "Document cannot be restored"
          };
        }

        await tx.query(
          `UPDATE "EmployeeDocument"
           SET "archivedAt" = NULL,
               "archivedBy" = NULL
           WHERE "id" = $1`,
          [documentId]
        );

        await tx.query(
          `INSERT INTO "EmployeeDocumentAudit"
           ("documentId", "action", "actorId", "reason")
           VALUES ($1, 'RESTORED', $2, $3)`,
          [documentId, String(hr.id), reason || "Restored"]
        );

        return { success: true, message: "Document restored" };
      }

      if (old.archivedAt || !replacement) {
        return {
          success: false,
          message: "Only active documents can be replaced"
        };
      }

      const newId = randomUUID();
      const storageKey = randomUUID() + replacement.extension;

      const folder = path.join(
        process.cwd(), ".private", "hr-documents"
      );

      await mkdir(folder, { recursive: true });

      writtenFile = path.join(folder, storageKey);

      await writeFile(writtenFile, replacement.bytes, {
        flag: "wx",
        mode: 0o600
      });

      await tx.query(
        `INSERT INTO "EmployeeDocument"
         ("id", "employeeId", "documentType",
          "originalName", "storageKey",
          "mimeType", "sizeBytes")
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          newId,
          old.employeeId,
          old.documentType,
          replacement.name,
          storageKey,
          replacement.mime,
          replacement.bytes.length
        ]
      );

      await tx.query(
        `UPDATE "EmployeeDocument"
         SET "archivedAt" = NOW(),
             "archivedBy" = $2,
             "replacedById" = $3
         WHERE "id" = $1`,
        [documentId, String(hr.id), newId]
      );

      await tx.query(
        `INSERT INTO "EmployeeDocumentAudit"
         ("documentId", "action", "actorId", "reason")
         VALUES
         ($1, 'REPLACED', $3, $4),
         ($2, 'REPLACEMENT_UPLOADED', $3, $4)`,
        [documentId, newId, String(hr.id), reason]
      );

      return {
        success: true,
        message: "New document saved; previous version archived"
      };
    });

    return Response.json(outcome, {
      status: outcome.success ? 200 : 409,
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    if (writtenFile) {
      await unlink(writtenFile).catch(() => {});
    }

    return error("Document operation failed", 500);
  }
}
