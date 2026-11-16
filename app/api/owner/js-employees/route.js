import { NextResponse } from "next/server";
import { currentOwner } from "../../../lib/owner-auth";
import { db } from "../../../lib/database";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const actor = await currentOwner();
  if (!actor) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "")
    .trim().slice(0, 60);
  const rawIds = url.searchParams.get("ids");
  const ids = rawIds === null
    ? null
    : [...new Set(rawIds.split(/[\n,;\s]+/)
      .map(value => value.trim().toLowerCase())
      .filter(Boolean))];
  if (ids && (ids.length === 0 || ids.length > 100 ||
      ids.some(id => id.length > 80))) {
    return NextResponse.json({
      error: "Enter between 1 and 100 Employee IDs; each ID must be 80 characters or fewer."
    }, { status: 400 });
  }
  const requestedPage = Number(url.searchParams.get("page"));
  const page = Number.isInteger(requestedPage)
    ? Math.max(1, Math.min(100, requestedPage))
    : 1;
  const pageSize = ids ? 100 : 25;
  const offset = (page - 1) * pageSize;
  try {
    const tables = await db.query(`
      SELECT table_name AS "name"
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
        error: tables.length === 0
          ? "Employee table not identified."
          : "Multiple Employee tables found. Verify schema."
      }, { status: 409 });
    }
    const table = tables[0].name;
    const identifier = '"' + table.replace(/"/g, '""') + '"';
    const searchSQL = ids ? `
      LOWER(COALESCE(to_jsonb(e)->>'permanentId', '')) = ANY($1::text[])
      OR LOWER(COALESCE(to_jsonb(e)->>'employeeCode', '')) = ANY($1::text[])
      OR LOWER(COALESCE(to_jsonb(e)->>'employeeNo', '')) = ANY($1::text[])
      OR LOWER(COALESCE(to_jsonb(e)->>'employeeNumber', '')) = ANY($1::text[])
      OR LOWER(COALESCE(to_jsonb(e)->>'id', '')) = ANY($1::text[])
    ` : `
      $1::text = ''
      OR COALESCE(
        to_jsonb(e)->>'fullName',
        to_jsonb(e)->>'name',
        to_jsonb(e)->>'employeeName',
        concat_ws(' ',
          to_jsonb(e)->>'firstName',
          to_jsonb(e)->>'lastName'
        )
      ) ILIKE '%' || $1::text || '%'
      OR COALESCE(to_jsonb(e)->>'permanentId', '') ILIKE '%' || $1::text || '%'
      OR COALESCE(to_jsonb(e)->>'employeeCode', '') ILIKE '%' || $1::text || '%'
      OR COALESCE(to_jsonb(e)->>'employeeNo', '') ILIKE '%' || $1::text || '%'
      OR COALESCE(to_jsonb(e)->>'employeeNumber', '') ILIKE '%' || $1::text || '%'
    `;
    const filterValues = ids ? [ids] : [q];
    const totalResult = await db.query(`
      SELECT COUNT(*)::integer AS total
      FROM public.${identifier} e
      WHERE ${searchSQL}
    `, filterValues);
    const rows = await db.query(`
      SELECT
        COALESCE(
          to_jsonb(e)->>'permanentId',
          to_jsonb(e)->>'employeeCode',
          to_jsonb(e)->>'employeeNo',
          to_jsonb(e)->>'employeeNumber',
          to_jsonb(e)->>'id',
          ''
        ) AS "employeeId",
        COALESCE(to_jsonb(e)->>'employeeCode', '') AS "employeeCode",
        COALESCE(to_jsonb(e)->>'permanentId', '') AS "permanentId",
        COALESCE(
          to_jsonb(e)->>'fullName',
          to_jsonb(e)->>'employeeName',
          to_jsonb(e)->>'name',
          NULLIF(concat_ws(' ',
            to_jsonb(e)->>'firstName',
            to_jsonb(e)->>'lastName'
          ), ''),
          ''
        ) AS "fullName",
        COALESCE(
          to_jsonb(e)->>'departmentName',
          to_jsonb(e)->>'department',
          ''
        ) AS "department",
        COALESCE(
          to_jsonb(e)->>'designationName',
          to_jsonb(e)->>'designation',
          to_jsonb(e)->>'jobTitle',
          ''
        ) AS "designation",
        COALESCE(
          to_jsonb(e)->>'status',
          to_jsonb(e)->>'employmentStatus',
          CASE
            WHEN to_jsonb(e)->>'isActive' = 'true'
              THEN 'ACTIVE'
            WHEN to_jsonb(e)->>'isActive' = 'false'
              THEN 'INACTIVE'
            ELSE ''
          END
        ) AS "status"
      FROM public.${identifier} e
      WHERE ${searchSQL}
      ORDER BY "fullName", "employeeId"
      LIMIT $2 OFFSET $3
    `, [...filterValues, pageSize, offset]);
    const requestedIds = ids || [];
    const foundAliases = new Set(rows.flatMap(row => [
      row.employeeId,
      row.employeeCode,
      row.permanentId
    ].filter(Boolean).map(value => String(value).toLowerCase())));
    return NextResponse.json({
      connected: true,
      table,
      rows,
      requestedIds,
      missingIds: requestedIds.filter(id => !foundAliases.has(id)),
      total: totalResult[0]?.total ?? 0,
      page,
      pageSize
    }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({
      error: "Employee query failed. Check database schema."
    }, { status: 503 });
  }
}
