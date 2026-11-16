import 'server-only';
import { z } from 'zod';
import { db, type Database } from './database';
import { PortalError } from './portal-http';

export type SupplierActor = { id: string; role: string } | null;
const optionalText = (max: number) => z.string().trim().max(max);
export const supplierInput = z.object({
  companyName: z.string().trim().min(2, 'Enter a supplier name.').max(200),
  contactName: optionalText(200).default(''),
  email: z.union([z.literal(''), z.email().max(254)]).default(''),
  phone: optionalText(40).default(''),
  category: optionalText(100).default(''),
  paymentTerms: optionalText(120).default(''),
  address: optionalText(500).default(''),
  notes: optionalText(2000).default(''),
}).strict();
const supplierId = z.uuid();
function supplierSnapshot(value: z.infer<typeof supplierInput>, status = 'ACTIVE') {
  return { companyName: value.companyName, contactName: value.contactName, email: value.email.toLowerCase(), phone: value.phone,
    category: value.category, paymentTerms: value.paymentTerms, address: value.address, notes: value.notes, status };
}

export function supplierCanWrite(actor: SupplierActor) {
  return !!actor?.id && ['HR_ADMIN', 'HR_OFFICER'].includes(actor.role);
}
function requireActor(actor: SupplierActor, write = false): asserts actor is NonNullable<SupplierActor> {
  if (!actor || !actor.id || !['HR_ADMIN', 'HR_OFFICER', 'HR_VIEWER'].includes(actor.role)) {
    throw new PortalError(actor ? 403 : 401, actor ? 'HR permission required.' : 'Please sign in to view suppliers.');
  }
  if (write && !supplierCanWrite(actor)) throw new PortalError(403, 'HR Admin or HR Officer permission is required to manage suppliers.');
}

export async function listSuppliers(actor: SupplierActor, database: Database = db) {
  requireActor(actor);
  const suppliers = await database.query(`SELECT id,"companyName","contactName",email,phone,category,"paymentTerms",address,notes,status,"createdAt","updatedAt"
    FROM "Supplier" ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END, lower("companyName") LIMIT 1000`);
  const events = actor.role === 'HR_VIEWER' ? [] : await database.query(`SELECT a.id,a."supplierId",s."companyName",a.action,a.detail,a."createdAt",h.email AS "actorEmail"
    FROM "SupplierAudit" a JOIN "Supplier" s ON s.id=a."supplierId" JOIN "HRUser" h ON h.id=a."actorId"
    ORDER BY a."createdAt" DESC,a.id DESC LIMIT 100`);
  return { suppliers, events, actor: { role: actor.role } };
}

export async function saveSupplier(body: unknown, actor: SupplierActor, database: Database = db) {
  requireActor(actor, true);
  const parsed = supplierInput.safeParse(body);
  if (!parsed.success) throw new PortalError(400, parsed.error.issues[0]?.message ?? 'Check the supplier details.');
  const value = parsed.data;
  try {
    return await database.transaction(async tx => {
      const [supplier] = await tx.query(`INSERT INTO "Supplier"("companyName","contactName",email,phone,category,"paymentTerms",address,notes,"createdBy","updatedBy")
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`,
        [value.companyName,value.contactName,value.email.toLowerCase(),value.phone,value.category,value.paymentTerms,value.address,value.notes,actor.id]);
      await tx.query(`INSERT INTO "SupplierAudit"("supplierId","actorId",action,detail) VALUES($1,$2,'CREATED',$3::jsonb)`,
        [supplier.id,actor.id,JSON.stringify({after:supplierSnapshot(value)})]);
      return { id: String(supplier.id) };
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new PortalError(409, 'A supplier with this name already exists.');
    throw error;
  }
}

export async function updateSupplier(id: string, body: unknown, actor: SupplierActor, database: Database = db) {
  requireActor(actor, true);
  if (!supplierId.safeParse(id).success) throw new PortalError(400, 'Invalid supplier ID.');
  const parsed = supplierInput.safeParse(body);
  if (!parsed.success) throw new PortalError(400, parsed.error.issues[0]?.message ?? 'Check the supplier details.');
  const value = parsed.data;
  try {
    return await database.transaction(async tx => {
      const [before] = await tx.query('SELECT "companyName","contactName",email,phone,category,"paymentTerms",address,notes,status FROM "Supplier" WHERE id=$1 FOR UPDATE',[id]);
      if (!before) throw new PortalError(404, 'Supplier not found.');
      const [saved] = await tx.query(`UPDATE "Supplier" SET "companyName"=$2,"contactName"=$3,email=$4,phone=$5,category=$6,"paymentTerms"=$7,address=$8,notes=$9,"updatedBy"=$10,"updatedAt"=now()
        WHERE id=$1 RETURNING id`,[id,value.companyName,value.contactName,value.email.toLowerCase(),value.phone,value.category,value.paymentTerms,value.address,value.notes,actor.id]);
      await tx.query(`INSERT INTO "SupplierAudit"("supplierId","actorId",action,detail) VALUES($1,$2,'UPDATED',$3::jsonb)`,
        [id,actor.id,JSON.stringify({before:{companyName:before.companyName,contactName:before.contactName,email:before.email,phone:before.phone,category:before.category,paymentTerms:before.paymentTerms,address:before.address,notes:before.notes,status:before.status},after:supplierSnapshot(value,String(before.status))})]);
      return { id: String(saved.id) };
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new PortalError(409, 'A supplier with this name already exists.');
    throw error;
  }
}

export async function setSupplierStatus(id: string, status: 'ACTIVE' | 'INACTIVE', actor: SupplierActor, database: Database = db) {
  requireActor(actor, true);
  if (!supplierId.safeParse(id).success) throw new PortalError(400, 'Invalid supplier ID.');
  return database.transaction(async tx => {
    const [supplier] = await tx.query('SELECT status FROM "Supplier" WHERE id=$1 FOR UPDATE',[id]);
    if (!supplier) throw new PortalError(404, 'Supplier not found.');
    if (supplier.status === status) return { id, status };
    await tx.query('UPDATE "Supplier" SET status=$2,"updatedBy"=$3,"updatedAt"=now() WHERE id=$1',[id,status,actor.id]);
    await tx.query(`INSERT INTO "SupplierAudit"("supplierId","actorId",action,detail) VALUES($1,$2,$3,$4::jsonb)`,
      [id,actor.id,status === 'ACTIVE' ? 'ACTIVATED' : 'DEACTIVATED',JSON.stringify({before:{status:supplier.status},after:{status}})]);
    return { id, status };
  });
}
