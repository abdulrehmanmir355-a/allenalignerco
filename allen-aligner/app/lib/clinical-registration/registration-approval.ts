import "server-only";
import type { Database } from "@/app/lib/database";
import { db } from "@/app/lib/database";
import { PortalError } from "@/app/lib/portal-http";
import { clinicalRegistrationPolicy } from "./policy";
import { registrationMessages } from "./messages";
import { securityEvent } from "./access-control";

export async function syncRegistrationDecision(
  tx: Database,
  input: {
    accountId: string;
    employeeId: string | null;
    requestId: string;
    decision: "APPROVE" | "REJECT";
    reason: string;
    clinicalRole: string | null;
  },
  actor: { id: string; role: string },
) {
  if (!input.employeeId) return;
  const [request] = await tx.query(
    `SELECT id,status,"passwordHash","employeeId" FROM "ClinicalRegistrationRequest" WHERE id=$1::uuid FOR UPDATE`,
    [input.requestId],
  );
  if (input.decision === "APPROVE" && request?.passwordHash) {
    const [account] = await tx.query(`SELECT "passwordHash" FROM "WorkAccount" WHERE id=$1 FOR UPDATE`, [input.accountId]);
    await tx.query(
      `UPDATE "WorkAccount" SET "passwordHash"=COALESCE("passwordHash",$2),"isActive"=true,"mustChangePassword"=false WHERE id=$1`,
      [input.accountId, account.passwordHash || request.passwordHash],
    );
  }
  const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  if (request) {
    await tx.query(
      `UPDATE "ClinicalRegistrationRequest"
          SET status=$2,"decidedAt"=clock_timestamp(),"decidedBy"=$3,"decidedByRole"=$4,"decisionReason"=$5,
              "activatedAt"=CASE WHEN $2='APPROVED' THEN clock_timestamp() ELSE "activatedAt" END,
              "passwordHash"=NULL
        WHERE id=$1`,
      [input.requestId, status, actor.id, actor.role, input.reason],
    );
  } else if (input.employeeId) {
    const [account] = await tx.query(
      `SELECT e.email,e."fullName",e.department,e.designation,e.status FROM "Employee" e WHERE e.id=$1`,
      [input.employeeId],
    );
    if (account) {
      await tx.query(
        `INSERT INTO "ClinicalRegistrationRequest"
          (id,"employeeId","accountId",email,"fullName",department,"jobTitle","employeeStatus","requestedRole",pathway,status,"decidedAt","decidedBy","decidedByRole","decisionReason","activatedAt")
         VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,'STANDARD',$10,clock_timestamp(),$11,$12,$13,CASE WHEN $10='APPROVED' THEN clock_timestamp() ELSE NULL END)`,
        [input.requestId, input.employeeId, input.accountId, account.email, account.fullName, account.department, account.designation, account.status, input.clinicalRole || "REVIEWER", status, actor.id, actor.role, input.reason],
      );
    }
  }
  if (input.decision === "APPROVE") await tx.query(`DELETE FROM "WorkSession" WHERE "accountId"=$1`, [input.accountId]);
  await securityEvent(tx, "clinical.registration.decided", input.employeeId, actor.id, { requestId: input.requestId, decision: input.decision, role: actor.role });
}

export async function listRegistrationRequests(filters: { employeeId?: string; email?: string; department?: string; status?: string }, database: Database = db) {
  const status = filters.status?.trim() || "";
  return database.query(
    `SELECT r.id::text AS "requestId",w.id::text AS "accountId",e."permanentId" AS "employeeId",e."fullName" AS "employeeName",
            r.email,r.department,r."jobTitle",r."employeeStatus",r."requestedRole",r.pathway,r.status,r.reason,r."requestedAt",
            r."decidedAt",r."decidedByRole",r."decisionReason",r."activatedAt",
            w."isActive" AS "accountActive",w."mustChangePassword",w."clinicalRole"
       FROM "ClinicalRegistrationRequest" r
       JOIN "Employee" e ON e.id=r."employeeId"
       JOIN "WorkAccount" w ON w.id=r."accountId"
      WHERE ($1='' OR UPPER(e."permanentId") LIKE UPPER($1))
        AND ($2='' OR UPPER(r.email) LIKE UPPER($2))
        AND ($3='' OR UPPER(r.department)=UPPER($3))
        AND ($4='' OR r.status=$4)
      ORDER BY r."requestedAt" DESC
      LIMIT 200`,
    [`%${filters.employeeId?.trim() || ""}%`, `%${filters.email?.trim() || ""}%`, filters.department?.trim() || "", status],
  );
}

export async function suspendClinicalAccount(tx: Database, accountId: string, reason: string, actor: { id: string; role: string }) {
  const [account] = await tx.query(
    `SELECT w.id,w."employeeId",w."clinicalRole",e.email FROM "WorkAccount" w JOIN "Employee" e ON e.id=w."employeeId" WHERE w.id=$1 FOR UPDATE OF w`,
    [accountId],
  );
  if (!account) throw new PortalError(404, "Employee account not found.");
  if (account.id === actor.id) throw new PortalError(403, "You cannot suspend your own clinical access.");
  if (clinicalRegistrationPolicy.suspendClearsClinicalRole) {
    await tx.query(`UPDATE "WorkAccount" SET "clinicalRole"=NULL WHERE id=$1`, [account.id]);
  }
  if (clinicalRegistrationPolicy.suspendDisablesEmployeePortal) {
    await tx.query(`UPDATE "WorkAccount" SET "isActive"=false WHERE id=$1`, [account.id]);
  }
  await tx.query(`DELETE FROM "WorkSession" WHERE "accountId"=$1`, [account.id]);
  await tx.query(
    `UPDATE "ClinicalRegistrationRequest" SET status='SUSPENDED',"decidedAt"=clock_timestamp(),"decidedBy"=$2,"decidedByRole"=$3,"decisionReason"=$4,"passwordHash"=NULL
      WHERE "employeeId"=$1 AND status='APPROVED'`,
    [account.employeeId, actor.id, actor.role, reason],
  );
  const [existing] = await tx.query(`SELECT 1 FROM "ClinicalRegistrationRequest" WHERE "employeeId"=$1 AND status='SUSPENDED' LIMIT 1`, [account.employeeId]);
  if (!existing) {
    const [employee] = await tx.query(`SELECT email,"fullName",department,designation,status FROM "Employee" WHERE id=$1`, [account.employeeId]);
    await tx.query(
      `INSERT INTO "ClinicalRegistrationRequest"
        ("employeeId","accountId",email,"fullName",department,"jobTitle","employeeStatus","requestedRole",pathway,status,"decidedAt","decidedBy","decidedByRole","decisionReason")
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'STANDARD','SUSPENDED',clock_timestamp(),$9,$10,$11)`,
      [account.employeeId, account.id, employee.email, employee.fullName, employee.department, employee.designation, employee.status, account.clinicalRole || "REVIEWER", actor.id, actor.role, reason],
    );
  }
  await securityEvent(tx, "clinical.account.suspended", account.employeeId, actor.id, { accountId, reason });
  return { message: "Clinical access suspended." };
}
