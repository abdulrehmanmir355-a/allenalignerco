"use server";

import { redirect } from "next/navigation";
import { financeActionActor } from "../../lib/finance-auth";
import { db } from "../../lib/database";
import { canApprovePayroll, canEditPayrollSalary, canGeneratePayroll, canRecordPayrollPayment } from "../../lib/payroll-access";

function value(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function validMoney(s: string) {
  return /^\d{1,10}(\.\d{1,2})?$/.test(s);
}

function validDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === s;
}

export async function saveSalary(form: FormData) {
  const hr = await financeActionActor().catch(() => null);
  if (!hr || !canEditPayrollSalary(hr.role) || !hr.id) {
    redirect("/finance/login");
  }

  const id = value(form, "employeeId");
  const basic = value(form, "basic");
  const allowance = value(form, "allowance");
  const deduction = value(form, "deduction");
  const date = value(form, "effectiveFrom");
  const reason = value(form, "reason");

  if (
    id.length < 1 ||
    id.length > 128 ||
    !validMoney(basic) ||
    !validMoney(allowance) ||
    !validMoney(deduction) ||
    Number(basic) <= 0 ||
    Number(deduction) >
      Number(basic) + Number(allowance) ||
    !validDate(date) ||
    reason.length < 5 ||
    reason.length > 500
  ) {
    redirect("/finance?result=invalid");
  }

  let result = "error";

  try {
    result = await db.transaction(async tx => {
      const employees = await tx.query(
        `SELECT "id", "status"::text AS status
         FROM "Employee"
         WHERE "id"::text = $1
         FOR UPDATE`,
        [id]
      );

      if (!employees.length) return "missing";

      if (employees[0].status.toUpperCase() !== "ACTIVE") {
        return "inactive";
      }

      const oldRows = await tx.query(
        `SELECT "basic"::text AS basic,
                "allowance"::text AS allowance,
                "deduction"::text AS deduction,
                "effectiveFrom"::text AS "effectiveFrom"
         FROM "HRPayrollSalary"
         WHERE "employeeId" = $1
         FOR UPDATE`,
        [employees[0].id]
      );

      const old = oldRows[0];

      if (
        old &&
        Number(old.basic) === Number(basic) &&
        Number(old.allowance) === Number(allowance) &&
        Number(old.deduction) === Number(deduction) &&
        old.effectiveFrom === date
      ) {
        return "unchanged";
      }

      await tx.query(
        `INSERT INTO "HRPayrollSalary"
         ("employeeId","basic","allowance","deduction",
          "effectiveFrom","updatedBy")
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT ("employeeId")
         DO UPDATE SET
           "basic" = EXCLUDED."basic",
           "allowance" = EXCLUDED."allowance",
           "deduction" = EXCLUDED."deduction",
           "effectiveFrom" = EXCLUDED."effectiveFrom",
           "updatedBy" = EXCLUDED."updatedBy",
           "updatedAt" = NOW()`,
        [
          employees[0].id,
          basic,
          allowance,
          deduction,
          date,
          String(hr.id)
        ]
      );

      await tx.query(
        `INSERT INTO "HRPayrollSalaryHistory"
         ("employeeId","oldBasic","newBasic",
          "oldAllowance","newAllowance",
          "oldDeduction","newDeduction",
          "effectiveFrom","reason","changedBy")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          employees[0].id,
          old?.basic ?? null,
          basic,
          old?.allowance ?? null,
          allowance,
          old?.deduction ?? null,
          deduction,
          date,
          reason,
          String(hr.id)
        ]
      );

      return "saved";
    });
  } catch (error) {
    console.error("Payroll salary save failed:", error);
  }

  redirect(`/finance?result=${result}`);
}

export async function generatePayroll(form: FormData) {
  const hr = await financeActionActor().catch(() => null);

  if (!hr || !canGeneratePayroll(hr.role) || !hr.id) {
    redirect("/finance/login");
  }

  const month = value(form, "month");

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    redirect("/finance?result=invalid");
  }

  const period = month + "-01";
  let result = "error";

  try {
    const createdCount = await db.transaction(async tx => {
      const created = await tx.query(
        `INSERT INTO "HRPayrollDraft"
         ("employeeId","period","basic",
          "allowance","deduction","createdBy")
         SELECT
           s."employeeId",
           $1::date,
           s."basic",
           s."allowance",
           s."deduction",
           $2
         FROM "HRPayrollSalary" s
         INNER JOIN "Employee" e
           ON e."id" = s."employeeId"
         WHERE UPPER(e."status"::text) = 'ACTIVE'
           AND s."effectiveFrom" <= $1::date
         ON CONFLICT ("employeeId","period")
           DO NOTHING
         RETURNING "id"`,
        [period, String(hr.id)]
      );

      for (const row of created) {
        await tx.query(
          `INSERT INTO "HRPayrollDraftAudit"
           ("draftId","action","actorId")
           VALUES ($1,'DRAFT_GENERATED',$2)`,
          [row.id, String(hr.id)]
        );
      }

      return created.length;
    });

    result = createdCount > 0 ? "generated" : "none";
  } catch (error) {
    console.error("Payroll draft generation failed:", error);
  }

  redirect(
    `/finance?month=${encodeURIComponent(month)}&result=${result}`
  );
}

export async function approvePayrollDraft(form: FormData) {
  const hr = await financeActionActor().catch(() => null);
  if (!hr || !canApprovePayroll(hr.role) || !hr.id) redirect("/finance/login");
  const id = value(form, "draftId");
  const month = value(form, "month");
  if (!/^[a-f0-9-]{36}$/i.test(id) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    redirect("/finance?result=invalid");
  }
  let result = "error";
  try {
    result = await db.transaction(async tx => {
      const rows = await tx.query(
        `UPDATE "HRPayrollDraft"
         SET "status"='APPROVED',"approvedBy"=$2,"approvedAt"=NOW()
         WHERE "id"=$1::uuid AND "status"='DRAFT'
         RETURNING "id"`,
        [id, String(hr.id)]
      );
      if (!rows.length) return "notdraft";
      await tx.query(
        `INSERT INTO "HRPayrollDraftAudit" ("draftId","action","actorId")
         VALUES ($1,'DRAFT_APPROVED',$2)`,
        [id, String(hr.id)]
      );
      return "approved";
    });
  } catch (error) {
    console.error("Payroll approval failed:", error);
  }
  redirect(`/finance?month=${encodeURIComponent(month)}&result=${result}`);
}

export async function recordPayrollPayment(form: FormData) {
  const hr = await financeActionActor().catch(() => null);
  if (!hr || !canRecordPayrollPayment(hr.role) || !hr.id) redirect("/finance/login");
  const id = value(form, "draftId");
  const month = value(form, "month");
  const method = value(form, "paymentMethod");
  const reference = value(form, "paymentReference");
  const paidDate = value(form, "paidDate");
  if (
    !/^[a-f0-9-]{36}$/i.test(id) ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    !["BANK_TRANSFER","CASH","CHEQUE","OTHER"].includes(method) ||
    reference.length < 3 || reference.length > 120 ||
    !validDate(paidDate) || paidDate > new Date().toISOString().slice(0,10)
  ) redirect("/finance?result=invalid");
  let result = "error";
  try {
    result = await db.transaction(async tx => {
      const rows = await tx.query(
        `UPDATE "HRPayrollDraft"
         SET "status"='PAID',"paidBy"=$2,"paidAt"=$3::date,
             "paymentMethod"=$4,"paymentReference"=$5
         WHERE "id"=$1::uuid AND "status"='APPROVED'
         RETURNING "id"`,
        [id, String(hr.id), paidDate, method, reference]
      );
      if (!rows.length) return "notapproved";
      await tx.query(
        `INSERT INTO "HRPayrollDraftAudit" ("draftId","action","actorId")
         VALUES ($1,'PAYMENT_RECORDED',$2)`,
        [id, String(hr.id)]
      );
      return "paid";
    });
  } catch (error) {
    console.error("Payroll payment recording failed:", error);
  }
  redirect(`/finance?month=${encodeURIComponent(month)}&result=${result}`);
}
