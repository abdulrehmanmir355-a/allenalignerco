import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, type Database } from './database';
import { hrRequireEmployee, hrScope } from './hr-scope';
import { PortalError } from './portal-http';

export type EmployeeHR = { id: string; role: string };
export type EmployeeRecord = {
  id: string; employeeCode: string; permanentId: string; fullName: string;
  email: string | null; department: string; designation: string;
  joinedOn: string | null; status: string; phone: string;
  createdAt: string; updatedAt: string;
};
export type EmployeeHistory = {
  profile: Record<string, unknown>[]; position: Record<string, unknown>[];
  audit: Record<string, unknown>[]; onboarding: Record<string, unknown>[];
  offboarding: Record<string, unknown>[];
};

const employeeFields = {
  fullName: z.string().trim().min(2, 'Enter the employee’s full name.').max(200),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid employee email.').max(254)),
  department: z.string().trim().min(1, 'Enter a department.').max(120),
  designation: z.string().trim().min(1, 'Enter a designation.').max(120),
  joinedOn: z.iso.date('Enter a valid joining date.'),
  phone: z.string().trim().max(40).optional(),
};
const createSchema = z.object({ ...employeeFields, requestId: z.uuid('Refresh the form before saving again.') }).strict();
const updateSchema = z.object({
  ...employeeFields,
  status: z.enum(['ACTIVE', 'INACTIVE', 'OFFBOARDING']).optional(),
}).strict();
const safeColumns = `e.id,e."employeeCode",e."permanentId",e."fullName",e.email,
  e.department,e.designation,to_char(e."joinedOn",'YYYY-MM-DD') AS "joinedOn",
  e.status,e.phone,e."createdAt",e."updatedAt"`;

function role(user: EmployeeHR, write = false) {
  const allowed = write ? ['HR_ADMIN', 'HR_OFFICER'] : ['HR_ADMIN', 'HR_OFFICER', 'HR_VIEWER'];
  if (!user.id || !allowed.includes(user.role)) throw new PortalError(403, 'HR permission required.');
}
function saved(row: Record<string, unknown>): EmployeeRecord {
  const instant = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
  return {
    id: String(row.id), employeeCode: String(row.employeeCode), permanentId: String(row.permanentId),
    fullName: String(row.fullName), email: row.email == null ? null : String(row.email),
    department: String(row.department), designation: String(row.designation),
    joinedOn: row.joinedOn == null ? null : String(row.joinedOn), status: String(row.status),
    phone: row.phone == null ? '' : String(row.phone), createdAt: instant(row.createdAt), updatedAt: instant(row.updatedAt),
  };
}
function validation<T>(parsed: z.ZodSafeParseResult<T>): T {
  if (!parsed.success) throw new PortalError(400, parsed.error.issues[0]?.message ?? 'Check the employee details.');
  return parsed.data;
}
function duplicate(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
    throw new PortalError(409, 'An employee with these details already exists. Open the existing profile instead.');
  }
  throw error;
}

export async function employeeList(user: EmployeeHR, filters: { q?: string; status?: string; page?: number } = {}) {
  role(user);
  const q = (filters.q ?? '').trim();
  if (q.length > 200) throw new PortalError(400, 'Search must be at most 200 characters.');
  const status = filters.status ?? '';
  if (status && !['ACTIVE', 'INACTIVE', 'OFFBOARDING'].includes(status)) throw new PortalError(400, 'Choose a valid employment status.');
  const requestedPage = Number.isFinite(filters.page) ? Math.max(1, Math.floor(filters.page!)) : 1;
  const scope = hrScope(user);
  const args: unknown[] = [...scope.args, status, q ? '%' + q.replace(/[\\%_]/g, '\\$&') + '%' : ''];
  const where = `WHERE ($3='' OR e.status=$3) AND ($4='' OR e."fullName" ILIKE $4 OR e.email ILIKE $4 OR e."employeeCode" ILIKE $4 OR e."permanentId" ILIKE $4 OR e.department ILIKE $4)`;
  const [count] = await db.query(scope.sql + `SELECT count(*)::int AS total FROM "Employee" e ${where}`, args);
  const total = Number(count.total), pageSize = 50;
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const employees = await db.query(scope.sql + `SELECT ${safeColumns} FROM "Employee" e ${where} ORDER BY e."createdAt" DESC,e.id LIMIT $5 OFFSET $6`, [...args, pageSize, (page - 1) * pageSize]);
  return { employees: employees.map(saved), total, page, pageSize };
}

export async function employeeDetail(id: string, user: EmployeeHR): Promise<EmployeeRecord> {
  role(user);
  await hrRequireEmployee(user, id);
  const [employee] = await db.query(`SELECT ${safeColumns} FROM "Employee" e WHERE e.id=$1`, [id]);
  if (!employee) throw new PortalError(404, 'Employee not found.');
  return saved(employee);
}

export async function employeeHistory(id: string, user: EmployeeHR): Promise<EmployeeHistory> {
  await employeeDetail(id, user);
  const [profile, position, audit, onboarding, offboarding] = await Promise.all([
    db.query(`SELECT p.id,p."oldFullName",p."newFullName",p."oldEmail",p."newEmail",p."oldStatus",p."newStatus",p."changedBy",p."changedAt",h.email AS "actorEmail" FROM "EmployeeProfileHistory" p LEFT JOIN "HRUser" h ON h.id=p."changedByHrUserId" WHERE p."employeeId"=$1 ORDER BY p."changedAt" DESC,p.id DESC LIMIT 200`, [id]),
    db.query(`SELECT p.id,p."previousDepartment",p."newDepartment",p."previousDesignation",p."newDesignation",to_char(p."effectiveDate",'YYYY-MM-DD') AS "effectiveDate",p.reason,p."approvalReference",p."changedBy",p."changedAt",h.email AS "actorEmail" FROM "EmployeePositionHistory" p LEFT JOIN "HRUser" h ON h.id=p."changedByHrUserId" WHERE p."employeeId"=$1 ORDER BY p."changedAt" DESC,p.id DESC LIMIT 200`, [id]),
    db.query(`SELECT a.id,a.action,a."recordId",a.detail,a."createdAt",h.email AS "actorEmail" FROM "ManagementAudit" a LEFT JOIN "HRUser" h ON h.id=a."hrActorId" WHERE a."employeeId"=$1 ORDER BY a."createdAt" DESC,a.id DESC LIMIT 200`, [id]),
    db.query(`SELECT o.id,o.task,o.status,h.email AS "completedBy" FROM "HROnboarding" o LEFT JOIN "HRUser" h ON h.id=o."completedBy" WHERE o."employeeId"=$1 ORDER BY o.task LIMIT 200`, [id]),
    db.query(`SELECT id,"exitType",to_char("lastWorkingDay",'YYYY-MM-DD') AS "lastWorkingDay",status,"createdAt" FROM "EmployeeOffboarding" WHERE "employeeId"=$1 ORDER BY "createdAt" DESC LIMIT 200`, [id]),
  ]);
  return { profile, position, audit, onboarding, offboarding };
}

async function employeeAudit(tx: Database, user: EmployeeHR, action: string, employeeId: string, detail: unknown = {}) {
  await tx.query(`INSERT INTO "ManagementAudit"("actorId",scope,action,"recordId","employeeId","hrActorId",detail) VALUES($1::text,'HR',$2,$3,$3,$1::uuid,$4::jsonb)`, [user.id, action, employeeId, JSON.stringify(detail)]);
}

async function classification(tx: Database, department: string, designation: string) {
  // Keep classification values data-driven: existing labels are reused, while a
  // new HR-entered label is added atomically with the employee create/update.
  await tx.query('INSERT INTO "HRDepartment" (name) VALUES($1) ON CONFLICT(name) DO NOTHING', [department]);
  await tx.query('INSERT INTO "HRDesignation" (name) VALUES($1) ON CONFLICT(name) DO NOTHING', [designation]);
}

export async function createEmployee(body: unknown, user: EmployeeHR, database: Database = db): Promise<{ employee: EmployeeRecord; replayed: boolean }> {
  role(user, true);
  const input = validation(createSchema.safeParse(body));
  const { requestId, ...fields } = input;
  const canonical = { ...fields, phone: fields.phone ?? '' };
  const payloadHash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  try {
    return await database.transaction(async tx => {
      // All existing employee write paths use this lock, including email duplicate checks.
      await tx.query('SELECT pg_advisory_xact_lock(204021)');
      const [receipt] = await tx.query('SELECT "employeeId","actorId","payloadHash" FROM "EmployeeRegistrationRequest" WHERE "requestId"=$1', [requestId]);
      if (receipt) {
        if (receipt.actorId !== user.id || receipt.payloadHash !== payloadHash) throw new PortalError(409, 'This submission was already used with different details. Refresh the form.');
        if (user.role !== 'HR_ADMIN' && !(await tx.query('SELECT 1 FROM "WorkHRGrant" WHERE "userId"=$1 AND "employeeId"=$2', [user.id, receipt.employeeId])).length) throw new PortalError(404, 'Employee not found.');
        const [employee] = await tx.query(`SELECT ${safeColumns} FROM "Employee" e WHERE e.id=$1`, [receipt.employeeId]);
        if (!employee) throw new PortalError(409, 'The previous submission needs HR administrator review.');
        return { employee: saved(employee), replayed: true };
      }
      await classification(tx, canonical.department, canonical.designation);
      const existing = await tx.query(`SELECT id FROM "Employee" WHERE lower(trim(email))=lower(trim($1)) LIMIT 1`, [canonical.email]);
      if (existing.length) throw new PortalError(409, 'An employee with this email already exists. Open the existing profile instead.');
      // PostgreSQL's identity trigger owns employeeCode/permanentId. UUID text preserves the existing primary-key type.
      const [inserted] = await tx.query(`INSERT INTO "Employee"(id,"employeeCode","fullName",email,department,designation,"joinedOn",phone,status,"createdBy") VALUES($1,'',$2,$3,$4,$5,$6,$7,'ACTIVE',$8) RETURNING id`, [randomUUID(), canonical.fullName, canonical.email, canonical.department, canonical.designation, canonical.joinedOn, canonical.phone, user.id]);
      const employeeId = String(inserted.id);
      if (user.role === 'HR_OFFICER') await tx.query('INSERT INTO "WorkHRGrant"("userId","employeeId") VALUES($1,$2) ON CONFLICT DO NOTHING', [user.id, employeeId]);
      await tx.query('INSERT INTO "EmployeeRegistrationRequest"("requestId","employeeId","actorId","payloadHash") VALUES($1,$2,$3,$4)', [requestId, employeeId, user.id, payloadHash]);
      const [employee] = await tx.query(`SELECT ${safeColumns} FROM "Employee" e WHERE e.id=$1`, [employeeId]);
      await employeeAudit(tx, user, 'employee.create', employeeId, { after: saved(employee) });
      return { employee: saved(employee), replayed: false };
    });
  } catch (error) { return duplicate(error); }
}

export async function updateEmployee(id: string, body: unknown, user: EmployeeHR, database: Database = db): Promise<EmployeeRecord> {
  role(user, true);
  const input = validation(updateSchema.safeParse(body));
  await hrRequireEmployee(user, id);
  try {
    return await database.transaction(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(204021)');
      const [old] = await tx.query(`SELECT ${safeColumns} FROM "Employee" e WHERE e.id=$1 FOR UPDATE`, [id]);
      if (!old) throw new PortalError(404, 'Employee not found.');
      await classification(tx, input.department, input.designation);
      const status = input.status ?? String(old.status);
      if (status !== old.status) {
        if (user.role !== 'HR_ADMIN') throw new PortalError(403, 'Only an HR administrator can change employment status.');
        const open = await tx.query(`SELECT id FROM "EmployeeOffboarding" WHERE "employeeId"=$1 AND status NOT IN ('COMPLETED','CANCELLED')`, [id]);
        if (open.length || status === 'OFFBOARDING') throw new PortalError(409, 'Change this status through the employee offboarding workflow.');
      }
      const emailDuplicate = await tx.query('SELECT id FROM "Employee" WHERE lower(trim(email))=lower(trim($1)) AND id<>$2 LIMIT 1', [input.email, id]);
      if (emailDuplicate.length) throw new PortalError(409, 'This email belongs to another employee.');
      const profileChanged = old.fullName !== input.fullName || old.email !== input.email || old.status !== status;
      const positionChanged = old.department !== input.department || old.designation !== input.designation;
      const phone = input.phone ?? String(old.phone ?? '');
      if (!profileChanged && !positionChanged && old.joinedOn === input.joinedOn && old.phone === phone) return saved(old);
      // A profile history snapshot accompanies every edit, including contact and joining-date corrections.
      await tx.query(`INSERT INTO "EmployeeProfileHistory"("employeeId","oldFullName","newFullName","oldEmail","newEmail","oldStatus","newStatus","changedBy","changedByHrUserId") VALUES($1,$2,$3,$4,$5,$6,$7,$8::text,$8::uuid)`, [id, old.fullName, input.fullName, old.email ?? '', input.email, old.status, status, user.id]);
      if (positionChanged) await tx.query(`INSERT INTO "EmployeePositionHistory"("employeeId","previousDepartment","newDepartment","previousDesignation","newDesignation","effectiveDate",reason,"approvalReference","changedBy","changedByHrUserId") VALUES($1,$2,$3,$4,$5,CURRENT_DATE,'Updated through authorized HR employee profile','Employee profile edit',$6::text,$6::uuid)`, [id, old.department, input.department, old.designation, input.designation, user.id]);
      await tx.query(`UPDATE "Employee" SET "fullName"=$2,email=$3,department=$4,designation=$5,"joinedOn"=$6,phone=$7,status=$8,"updatedAt"=now() WHERE id=$1`, [id, input.fullName, input.email, input.department, input.designation, input.joinedOn, phone, status]);
      const [employee] = await tx.query(`SELECT ${safeColumns} FROM "Employee" e WHERE e.id=$1`, [id]);
      await employeeAudit(tx, user, 'employee.update', id, { before: saved(old), after: saved(employee) });
      return saved(employee);
    });
  } catch (error) { return duplicate(error); }
}
