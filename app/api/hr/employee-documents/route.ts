import { hrEmployeeAllowed } from '../../../lib/hr-scope';
import { audit } from "../../../lib/hr-management";

import { sameOrigin } from "../../../lib/portal-auth";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { currentHR } from "../../../lib/hr-auth";
import { db } from "../../../lib/database";

export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024;

const allowedTypes = [
  "CV",
  "CNIC",
  "CONTRACT",
  "CERTIFICATE",
  "OTHER"
];

export async function POST(request: Request) {
  const hr = await currentHR().catch(() => null);

  if (!hr || !["HR_ADMIN", "HR_OFFICER"].includes(hr.role)) {
    return Response.json(
      { error: "HR permission required" },
      { status: 403 }
    );
  }

  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Invalid request origin" },
      { status: 403 }
    );
  }

  try {
    if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024) return Response.json({error:"File too large"},{status:413});
    const form = await request.formData();

    const employeeId = String(
      form.get("employeeId") ?? ""
    ).trim();

    if(!await hrEmployeeAllowed(hr,employeeId))return Response.json({error:'Employee not found'},{status:404});
    const documentType = String(
      form.get("documentType") ?? ""
    );

    const file = form.get("file");

    if (
      !employeeId ||
      employeeId.length > 100 ||
      !allowedTypes.includes(documentType) ||
      !(file instanceof File)
    ) {
      return Response.json(
        { error: "Invalid document information" },
        { status: 400 }
      );
    }

    if (file.size === 0 || file.size > MAX_SIZE) {
      return Response.json(
        { error: "File must be between 1 byte and 10 MB" },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    let extension = "";

    if (
      file.type === "application/pdf" &&
      bytes.subarray(0, 5).toString() === "%PDF-"
    ) {
      extension = ".pdf";
    } else if (
      file.type === "image/jpeg" &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    ) {
      extension = ".jpg";
    } else if (
      file.type === "image/png" &&
      bytes.subarray(0, 8).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      )
    ) {
      extension = ".png";
    }

    if (!extension) {
      return Response.json(
        { error: "Only valid PDF, JPG and PNG files allowed" },
        { status: 400 }
      );
    }

    const employees = await db.query(
      `SELECT "id" FROM "Employee"
       WHERE "id" = $1 LIMIT 1`,
      [employeeId]
    ) as { id: string }[];

    if (!employees.length) {
      return Response.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    const storageKey = randomUUID() + extension;
    const documentId = randomUUID();

    const folder = path.join(
      process.cwd(),
      ".private",
      "hr-documents"
    );

    const filePath = path.join(folder, storageKey);

    await mkdir(folder, { recursive: true });

    await writeFile(filePath, bytes, {
      flag: "wx",
      mode: 0o600
    });

    try {
      await db.transaction(async tx => {
      await tx.query(
        `INSERT INTO "EmployeeDocument"
         ("id", "employeeId", "documentType",
          "originalName", "storageKey",
          "mimeType", "sizeBytes")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          documentId,
          employeeId,
          documentType,
          path.basename(file.name).slice(0, 180),
          storageKey,
          file.type,
          file.size
        ]
      );
      await audit(tx, String(hr.id), "HR", "document.upload", documentId);
      });
    } catch {
      await unlink(filePath).catch(() => {});
      throw new Error("Document metadata save failed");
    }

    return Response.json({
      success: true,
      documentId,
      message: "Document saved"
    }, { status: 201 });

  } catch {
    return Response.json(
      { error: "Document upload failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
 const hr = await currentHR();
 if (!hr) return Response.json({error:"Login required"},{status:401});
 if (!["HR_ADMIN","HR_OFFICER"].includes(hr.role)) return Response.json({error:"Access denied"},{status:403});
 const employeeId = new URL(request.url).searchParams.get("employeeId");
 if(employeeId&&!await hrEmployeeAllowed(hr,employeeId))return Response.json({error:"Employee not found"},{status:404});
 if (!employeeId || employeeId.length > 100) return Response.json({error:"Employee ID required"},{status:400});
 try {
  const documents = await db.query('SELECT "id","originalName","documentType","uploadedAt","sizeBytes" FROM "EmployeeDocument" WHERE "employeeId"=$1 ORDER BY "uploadedAt" DESC LIMIT 200',[employeeId]);
  return Response.json({documents},{headers:{"Cache-Control":"private, no-store"}});
 } catch { return Response.json({error:"Document database unavailable"},{status:503}); }
}
