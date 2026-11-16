import type { Database } from "./database";
import "server-only";
import { db } from "./database";


// PostgreSQL may abort a contended transaction; restart the entire operation.
export async function patientTransaction<T>(work: (tx: Database) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.transaction(work, { maxWait: 10000, timeout: 20000 }); }
    catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
      if ((code === "40001" || code === "40P01") && attempt < 2) continue;
      console.error("Patient transaction failed:", code, error instanceof Error ? error.name : typeof error, error && typeof error === "object" ? Object.keys(error) : []);
      throw error;
    }
  }
}

