export function createDoctorApprovalRepository(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new Error("POSTGRES_POOL_REQUIRED");
  }

  return {
    async inTransaction(work) {
      const client = await pool.connect();
      let transactionStarted = false;

      try {
        await client.query("BEGIN");
        transactionStarted = true;

        const tx = {
          async getDoctorForUpdate(doctorId) {
            const result = await client.query(
              `SELECT
                 id,
                 "fullName",
                 email,
                 "registrationNumber",
                 "isVerified",
                 "clinicId"
               FROM "Doctor"
               WHERE id = $1
               FOR UPDATE`,
              [doctorId]
            );

            return result.rows[0] ?? null;
          },

          async getClinic(clinicId) {
            const result = await client.query(
              `SELECT id, name
               FROM "Clinic"
               WHERE id = $1
               FOR SHARE`,
              [clinicId]
            );

            return result.rows[0] ?? null;
          },

          async setDoctorApproved({
            doctorId,
            clinicId
          }) {
            const result = await client.query(
              `UPDATE "Doctor"
               SET
                 "isVerified" = TRUE,
                 "clinicId" = $2,
                 "updatedAt" = NOW()
               WHERE id = $1
                 AND "isVerified" = FALSE
                 AND (
                   "clinicId" IS NULL
                   OR "clinicId" = $2
                 )
               RETURNING id`,
              [doctorId, clinicId]
            );

            return result.rowCount;
          },

          async writeAudit({
            actorId,
            doctorId,
            clinicId,
            action,
            occurredAt
          }) {
            await client.query(
              `INSERT INTO "DoctorApprovalAudit"
                (
                  "actorId",
                  "doctorId",
                  "clinicId",
                  action,
                  "occurredAt"
                )
               VALUES ($1, $2, $3, $4, $5)`,
              [
                actorId,
                doctorId,
                clinicId,
                action,
                occurredAt
              ]
            );
          }
        };

        const result = await work(tx);

        await client.query("COMMIT");
        transactionStarted = false;

        return result;
      } catch (error) {
        if (transactionStarted) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            console.error(
              "Doctor approval rollback failed",
              rollbackError
            );
          }
        }

        throw error;
      } finally {
        client.release();
      }
    }
  };
}
