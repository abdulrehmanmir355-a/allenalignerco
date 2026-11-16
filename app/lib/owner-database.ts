import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

const state = globalThis as typeof globalThis & { ownerPool?: Pool; ownerUrl?: string };
function pool() {
  // Local development must stay on the local Owner database even when the
  // Neon production connection is also present in the developer environment.
  const url = process.env.NODE_ENV === "production"
    ? process.env.OWNER_NEON_DATABASE_URL || process.env.OWNER_DATABASE_URL
    : process.env.OWNER_DATABASE_URL;
  if (!url) throw new Error(process.env.NODE_ENV === "production"
    ? "OWNER_NEON_DATABASE_URL or OWNER_DATABASE_URL is missing"
    : "OWNER_DATABASE_URL is missing for local development");
  if (!state.ownerPool || state.ownerUrl !== url) {
    if (state.ownerPool) void state.ownerPool.end();
    state.ownerPool = new Pool({ connectionString: url, options: "-c timezone=UTC", max: 4, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
    state.ownerPool.on("error", error => console.error("Owner PostgreSQL pool error", error.name));
    state.ownerUrl = url;
  }
  return state.ownerPool;
}

export const ownerDb = {
  async query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
    return (await pool().query<T>(sql, values)).rows;
  },
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool().connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
};
