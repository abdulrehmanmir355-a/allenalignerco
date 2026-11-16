import { redirect } from "next/navigation";
import { currentOwner } from "../../../lib/owner-auth";
import { db } from "../../../lib/database";
export const dynamic = "force-dynamic";
type Column = {
  tableName: string;
  columnName: string;
  dataType: string;
};
type Relation = {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
};
export default async function EmployeeSchemaPage() {
  const actor = await currentOwner();
  if (!actor) redirect("/owner-login");
  let columns: Column[] = [];
  let relations: Relation[] = [];
  let error = "";
  try {
    columns = (await db.query(`
      SELECT
        table_name AS "tableName",
        column_name AS "columnName",
        data_type AS "dataType"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          table_name ILIKE '%employee%'
          OR table_name ILIKE '%department%'
          OR table_name ILIKE '%designation%'
          OR table_name ILIKE '%staff%'
        )
      ORDER BY table_name, ordinal_position
      LIMIT 300
    `)) as Column[];
    relations = (await db.query(`
      SELECT
        tc.table_name AS "sourceTable",
        kcu.column_name AS "sourceColumn",
        ccu.table_name AS "targetTable",
        ccu.column_name AS "targetColumn"
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.constraint_schema = kcu.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
       AND tc.constraint_schema = ccu.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND (
          tc.table_name ILIKE '%employee%'
          OR tc.table_name ILIKE '%department%'
          OR tc.table_name ILIKE '%designation%'
        )
      ORDER BY tc.table_name, kcu.column_name
      LIMIT 100
    `)) as Relation[];
  } catch {
    error = "Unable to read employee database schema. " +
      "Check PostgreSQL connectivity and permissions.";
  }
  const tableNames = Array.from(
    new Set(columns.map(c => c.tableName))
  );
  return (
    <main style={{
      maxWidth: 1200,
      margin: "auto",
      padding: "32px 20px"
    }}>
      <h1>Employee Database Connection</h1>
      <p>
        Owner-only read-only database schema inspection.
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <section className="panel padded">
            <h2>Connection Status</h2>
            <p>PostgreSQL query: Successful</p>
            <p>Relevant tables: {tableNames.length}</p>
            <p>Columns identified: {columns.length}</p>
            <p>Relationships identified: {relations.length}</p>
          </section>
          <section className="panel padded"
            style={{ marginTop: 20 }}>
            <h2>Employee Database Tables</h2>
            {!tableNames.length && (
              <p>
                No matching HR tables found.
                Database naming needs inspection.
              </p>
            )}
            {tableNames.map(name => (
              <details key={name}
                style={{ marginBottom: 14 }}>
                <summary style={{
                  cursor: "pointer",
                  padding: 12,
                  fontWeight: 700
                }}>
                  {name}
                </summary>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Column</th>
                        <th>Data Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {columns
                        .filter(c => c.tableName === name)
                        .map(c => (
                          <tr key={c.columnName}>
                            <td>{c.columnName}</td>
                            <td>{c.dataType}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </section>
          <section className="panel padded"
            style={{ marginTop: 20 }}>
            <h2>Database Relationships</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Source Table</th>
                    <th>Column</th>
                    <th>Related Table</th>
                    <th>Related Column</th>
                  </tr>
                </thead>
                <tbody>
                  {relations.map((r, i) => (
                    <tr key={i}>
                      <td>{r.sourceTable}</td>
                      <td>{r.sourceColumn}</td>
                      <td>{r.targetTable}</td>
                      <td>{r.targetColumn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!relations.length && (
              <p>
                No matching declared foreign keys found.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
