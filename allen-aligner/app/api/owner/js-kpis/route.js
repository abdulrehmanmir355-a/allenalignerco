import { NextResponse } from "next/server";
import { currentOwner } from "../../../lib/owner-auth";
import { db } from "../../../lib/database";
export const dynamic = "force-dynamic";
export async function GET() {
  const actor = await currentOwner();
  if (!actor) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  try {
    const tables = await db.query(`
      SELECT table_name AS name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND lower(table_name) IN (
          'employee', 'employees',
          'hremployee', 'hr_employee'
        )
    `);
    if (tables.length !== 1) {
      return NextResponse.json({
        connected: true,
        totalEmployees: null,
        activeEmployees: null,
        message: tables.length === 0
          ? "Employee table not identified."
          : "Multiple employee tables found; source ambiguous."
      });
    }
    const table = tables[0].name;
    const safeTable = '"' + table.replace(/"/g, '""') + '"';
    const columns = await db.query(`
      SELECT column_name AS name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `, [table]);
    const names = new Set(columns.map(x => x.name));
    let activeExpression = "NULL::integer";
    if (names.has("isActive")) {
      activeExpression =
        `COUNT(*) FILTER (WHERE "isActive" IS TRUE)::integer`;
    } else if (names.has("status")) {
      activeExpression =
        `COUNT(*) FILTER (WHERE LOWER("status"::text) = 'active')::integer`;
    }
    const result = await db.query(`
      SELECT
        COUNT(*)::integer AS "totalEmployees",
        ${activeExpression} AS "activeEmployees"
      FROM public.${safeTable}
    `);
    return NextResponse.json({
      connected: true,
      table,
      totalEmployees: result[0]?.totalEmployees ?? null,
      activeEmployees: result[0]?.activeEmployees ?? null,
      checkedAt: new Date().toISOString()
    }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({
      connected: false,
      error: "Database query failed. Check server logs."
    }, { status: 503 });
  }
}
