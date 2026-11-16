import { hrEmployeeAllowed } from '../../../../lib/hr-scope';
import { audit } from "../../../../lib/hr-management";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentHR } from "../../../../lib/hr-auth";
import { db } from "../../../../lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type DocumentRecord = {
  storageKey: string; employeeId:string;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  const hr = await currentHR().catch(() => null);

  if (!hr) {
    return Response.json(
      { error: "Login required" },
      { status: 401 }
    );
  }

  if (!["HR_ADMIN", "HR_OFFICER"].includes(hr.role)) {
    return Response.json(
      { error: "Access denied" },
      { status: 403 }
    );
  }

  const { id } = await context.params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json(
      { error: "Invalid document ID" },
      { status: 400 }
    );
  }

  try {
    const rows = await db.query(
      `SELECT "storageKey","employeeId"
       FROM "EmployeeDocument"
       WHERE "id" = $1
       LIMIT 1`,
      [id]
    ) as DocumentRecord[];

    if (!rows.length||!await hrEmployeeAllowed(hr,rows[0].employeeId)) {
      return Response.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const key = rows[0].storageKey;

    if (!/^[0-9a-f-]{36}\.(pdf|jpg|png)$/i.test(key)) {
      return Response.json(
        { error: "Invalid stored file reference" },
        { status: 500 }
      );
    }

    const filePath = path.join(
      process.cwd(),
      ".private",
      "hr-documents",
      key
    );

    const bytes = await readFile(filePath);

    await audit(db, String(hr.id), "HR", "document.download", id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition":
          `attachment; filename="document-${id}${path.extname(key)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return Response.json(
      { error: "Document could not be retrieved" },
      { status: 503 }
    );
  }
}
