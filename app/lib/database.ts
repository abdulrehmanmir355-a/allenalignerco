import "server-only";
import { assertPasswordHashWrite } from './password-format';
import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';
import { randomUUID } from 'node:crypto';
import schemaData from './db-schema.json';
import type { Models } from './db-models';

// These columns store UTC instants; DATE values must not drift with the Windows timezone.
types.setTypeParser(1114, value => new Date(value.replace(" ", "T") + "Z"));
types.setTypeParser(1082, value => new Date(value + "T00:00:00.000Z"));
type Row = Record<string, unknown>;
export type Where = Record<string, unknown>;
type Relation = { table: string; local: string[]; remote: string[]; many: boolean };
type Schema = { columns: string[]; relations: Record<string, Relation>; uuid: boolean; updated: boolean };
const schema: Record<string, Schema> = schemaData;
type Options = { where?: Where; select?: Record<string, boolean | Options>; include?: Record<string, boolean | Options>; orderBy?: Record<string, string> | Record<string, string>[]; take?: number; skip?: number };
type WriteOptions = Options & { data: Row };
const identifier = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const object = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid database filter');
  return value as Row;
};
const globalDb = globalThis as unknown as { allenPool?: Pool; allenDatabaseUrl?: string };
function clinicalDatabaseUrl() {
  // Local development always uses LOCAL_DATABASE_URL. Production uses Neon on
  // DATABASE_URL unless CLINICAL_DATABASE=local is set, which keeps Neon aside.
  const production = process.env.NODE_ENV === "production";
  const useLocal = !production || process.env.CLINICAL_DATABASE === "local";
  const url = useLocal ? process.env.LOCAL_DATABASE_URL : process.env.DATABASE_URL;
  if (!url) throw new Error(useLocal
    ? "LOCAL_DATABASE_URL is missing for the local clinical database"
    : "DATABASE_URL is missing");
  let host = "";
  try { host = new URL(url).hostname; } catch { throw new Error("Clinical database URL is invalid"); }
  const local = host === "127.0.0.1" || host === "localhost";
  if (useLocal && !local) throw new Error("LOCAL_DATABASE_URL must point at the local development database");
  if (!useLocal && local) throw new Error("Production cannot use the local development database");
  return url;
}
function pool() {
  const url = clinicalDatabaseUrl();
  if (!globalDb.allenPool || globalDb.allenDatabaseUrl !== url) {
    if (globalDb.allenPool) void globalDb.allenPool.end();
    globalDb.allenPool = new Pool({ connectionString: url, options: "-c timezone=UTC", max: 4, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
    globalDb.allenPool.on('error', error => console.error('PostgreSQL pool error', error.name));
    globalDb.allenDatabaseUrl = url;
  }
  return globalDb.allenPool;
}
function column(table: string, name: string, alias?: string) {
  if (!schema[table]?.columns.includes(name)) throw new Error('Unknown database column: ' + table + '.' + name);
  return (alias ? identifier(alias) + '.' : '') + identifier(name);
}
class SQL {
  values: unknown[] = [];
  parameter(value: unknown) { this.values.push(value); return '$' + this.values.length; }
  where(table: string, where: Where = {}, alias = table): string {
    const predicates: string[] = [];
    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) continue;
      if (key === 'AND' || key === 'OR') {
        const items = Array.isArray(value) ? value : [value];
        predicates.push(items.length ? '(' + items.map(item => this.where(table, object(item), alias)).join(key === 'AND' ? ' AND ' : ' OR ') + ')' : key === 'AND' ? 'TRUE' : 'FALSE');
      } else if (schema[table].relations[key]) {
        const rel = schema[table].relations[key], target = alias + '_' + key;
        const join = rel.local.map((field, i) => column(table, field, alias) + '=' + column(rel.table, rel.remote[i], target)).join(' AND ');
        predicates.push(`EXISTS (SELECT 1 FROM ${identifier(rel.table)} AS ${identifier(target)} WHERE ${join} AND ${this.where(rel.table, object(value), target)})`);
      } else if (key === 'clinicId_patientCode') {
        predicates.push(this.where(table, object(value), alias));
      } else {
        const col = column(table, key, alias);
        if (value === null) { predicates.push(col + ' IS NULL'); continue; }
        if (typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) { predicates.push(col + '=' + this.parameter(value)); continue; }
        const filter = object(value);
        for (const [op, operand] of Object.entries(filter)) {
          if (op === 'mode') { if (operand !== 'insensitive') throw new Error('Unsupported filter mode'); continue; }
          if (op === 'in') {
            if (!Array.isArray(operand)) throw new Error('Expected array');
            predicates.push(operand.length ? col + ' IN (' + operand.map(v => this.parameter(v)).join(',') + ')' : 'FALSE');
          } else if (op === 'not') predicates.push(operand === null ? col + ' IS NOT NULL' : col + '<>' + this.parameter(operand));
          else if (op === 'contains') {
            const escaped = String(operand).replace(/[\\%_]/g, '\\$&');
            predicates.push(col + (filter.mode === 'insensitive' ? ' ILIKE ' : ' LIKE ') + this.parameter('%' + escaped + '%'));
          } else if (['gt', 'gte', 'lt', 'lte', 'equals'].includes(op)) {
            const operators: Record<string, string> = { gt: '>', gte: '>=', lt: '<', lte: '<=', equals: '=' };
            predicates.push(col + operators[op] + this.parameter(operand));
          } else throw new Error('Unsupported database filter: ' + op);
        }
      }
    }
    return predicates.length ? predicates.join(' AND ') : 'TRUE';
  }
}
class Repository<K extends keyof Models> {
  constructor(private database: Database, private table: K) {}
  async findMany(options: Options = {}): Promise<Models[K][]> {
    const sql = new SQL(), meta = schema[this.table];
    const requested = options.select ? Object.keys(options.select).filter(k => options.select![k] && meta.columns.includes(k)) : meta.columns;
    const relations = { ...options.select, ...options.include };
    const columns = new Set(requested);
    for (const [name, spec] of Object.entries(relations)) if (spec && meta.relations[name]) meta.relations[name].local.forEach(k => columns.add(k));
    if (relations._count) meta.columns.filter(k => k === 'id').forEach(k => columns.add(k));
    let query = 'SELECT ' + (columns.size ? [...columns].map(k => column(this.table, k)).join(',') : '1 AS __exists') + ' FROM ' + identifier(this.table) + ' WHERE ' + sql.where(this.table, options.where);
    if (options.orderBy) {
      const orders = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy];
      query += ' ORDER BY ' + orders.flatMap(order => Object.entries(order).map(([key, dir]) => {
        if (!['asc', 'desc'].includes(dir)) throw new Error('Invalid sort direction');
        return column(this.table, key) + ' ' + dir;
      })).join(',');
    }
    for (const [key, keyword] of [['take', ' LIMIT '], ['skip', ' OFFSET ']] as const) {
      const n = options[key]; if (n !== undefined) { if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid pagination'); query += keyword + sql.parameter(n); }
    }
    const rows = await this.database.query(query, sql.values);
    for (const row of rows) {
      const loaded: Row = {};
      for (const [name, spec] of Object.entries(relations)) {
        if (!spec || meta.columns.includes(name)) continue;
        if (name === '_count') {
          const count: Row = {}, selected = spec === true ? Object.fromEntries(Object.keys(meta.relations).map(k => [k, true])) : spec.select || {};
          for (const field of Object.keys(selected)) {
            const rel = meta.relations[field]; if (!rel) throw new Error('Unknown count relation');
            count[field] = await this.database.repository(rel.table as keyof Models).count({ where: Object.fromEntries(rel.remote.map((k, i) => [k, row[rel.local[i]]])) });
          }
          loaded._count = count; continue;
        }
        const rel = meta.relations[name]; if (!rel) throw new Error('Unknown database relation: ' + name);
        if (rel.local.some(k => row[k] === null)) { loaded[name] = rel.many ? [] : null; continue; }
        const opts = spec === true ? {} : spec;
        const where = { AND: [opts.where || {}, Object.fromEntries(rel.remote.map((k, i) => [k, row[rel.local[i]]]))] };
        const records = await this.database.repository(rel.table as keyof Models).findMany({ ...opts, where });
        loaded[name] = rel.many ? records : records[0] || null;
      }
      if (options.select) for (const key of Object.keys(row)) if (!requested.includes(key)) delete row[key];
      Object.assign(row, loaded);
    }
    return rows as unknown as Models[K][];
  }
  async findFirst(options: Options = {}) { return (await this.findMany({ ...options, take: 1 }))[0] || null; }
  async findUnique(options: Options) { return this.findFirst(options); }
  async findUniqueOrThrow(options: Options) { const row = await this.findFirst(options); if (!row) throw new Error('Database record not found'); return row; }
  async count(options: Options = {}) {
    const sql = new SQL(); const rows = await this.database.query('SELECT COUNT(*)::int AS count FROM ' + identifier(this.table) + ' WHERE ' + sql.where(this.table, options.where), sql.values);
    return Number(rows[0].count);
  }
  async create(options: WriteOptions): Promise<Models[K]> {
    const meta = schema[this.table], data = { ...options.data };
    assertPasswordHashWrite(this.table, data);
    // Nested writes in this application are deliberately handled by explicit transactions at their callers.
    for (const key of Object.keys(data)) { if (!meta.columns.includes(key)) throw new Error('Unknown insert field: ' + key); if (data[key] === undefined) delete data[key]; }
    if (meta.uuid && data.id === undefined) data.id = randomUUID();
    if (meta.updated && data.updatedAt === undefined) data.updatedAt = new Date();
    const sql = new SQL(), keys = Object.keys(data);
    const rows = await this.database.query('INSERT INTO ' + identifier(this.table) + '(' + keys.map(k => column(this.table, k)).join(',') + ') VALUES (' + keys.map(k => sql.parameter(data[k])).join(',') + ') RETURNING *', sql.values);
    if (!options.select) return rows[0] as unknown as Models[K];
    return Object.fromEntries(Object.entries(rows[0]).filter(([key]) => options.select![key])) as unknown as Models[K];
  }
  private assignments(sql: SQL, data: Row) {
    assertPasswordHashWrite(this.table, data);
    const updated = { ...data }; if (schema[this.table].updated) updated.updatedAt = new Date();
    return Object.entries(updated).filter(([, v]) => v !== undefined).map(([k, v]) => {
      const col = column(this.table, k);
      if (v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
        const val = object(v); if (Object.keys(val).length !== 1 || typeof val.increment !== 'number') throw new Error('Unsupported update expression');
        return col + '=' + identifier(this.table) + '.' + col + '+' + sql.parameter(val.increment);
      }
      return col + '=' + sql.parameter(v);
    }).join(',');
  }
  async updateMany(options: WriteOptions) {
    const sql = new SQL(), set = this.assignments(sql, options.data);
    if (!options.where || !Object.keys(options.where).length) throw new Error('Update requires a filter');
    const rows = await this.database.query('UPDATE ' + identifier(this.table) + ' SET ' + set + ' WHERE ' + sql.where(this.table, options.where) + ' RETURNING 1', sql.values);
    return { count: rows.length };
  }
  async update(options: WriteOptions): Promise<Models[K]> {
    const sql = new SQL(), set = this.assignments(sql, options.data);
    if (!options.where || !Object.keys(options.where).length) throw new Error('Update requires a filter');
    const rows = await this.database.query('UPDATE ' + identifier(this.table) + ' SET ' + set + ' WHERE ' + sql.where(this.table, options.where) + ' RETURNING *', sql.values);
    if (rows.length !== 1) throw new Error('Expected one updated record');
    return rows[0] as unknown as Models[K];
  }
  async deleteMany(options: Options) {
    if (!options.where || !Object.keys(options.where).length) throw new Error('Delete requires a filter');
    const sql = new SQL(); const rows = await this.database.query('DELETE FROM ' + identifier(this.table) + ' WHERE ' + sql.where(this.table, options.where) + ' RETURNING 1', sql.values);
    return { count: rows.length };
  }
  async incrementThrottle(key: string, expiresAt: Date): Promise<number> {
    if (this.table !== 'LoginThrottle') throw new Error('Invalid throttle repository');
    const rows = await this.database.query('INSERT INTO "LoginThrottle" (key,"expiresAt",attempts) VALUES ($1,$2,1) ON CONFLICT (key) DO UPDATE SET attempts="LoginThrottle".attempts+1 RETURNING attempts', [key, expiresAt]);
    return Number(rows[0].attempts);
  }
  async maxVersion(where: Where): Promise<number> {
    const sql = new SQL(); const rows = await this.database.query('SELECT MAX(' + column(this.table, 'version') + ') AS version FROM ' + identifier(this.table) + ' WHERE ' + sql.where(this.table, where), sql.values);
    return Number(rows[0].version || 0);
  }
}
export class Database {
  constructor(private client?: PoolClient) {}
  repository<K extends keyof Models>(name: K) { return new Repository(this, name); }
  async query(text: string, values: unknown[] = []): Promise<QueryResultRow[]> { return (await (this.client || pool()).query(text, values.map(value => value instanceof Date ? value.toISOString() : value))).rows; }
  async transaction<T>(work: (tx: Database) => Promise<T>, options: { maxWait?: number; timeout?: number; isolation?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'; readOnly?: boolean } = {}): Promise<T> {
    if (this.client) return work(this);
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      if (options.isolation || options.readOnly) {
        const isolation = options.isolation ? ` ISOLATION LEVEL ${options.isolation}` : '';
        const access = options.readOnly ? ' READ ONLY' : '';
        await client.query(`SET TRANSACTION${isolation}${access}`);
      }
      await client.query("SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $2, true)", [String(options.timeout || 20000), String(options.maxWait || 10000)]);
      const result = await work(new Database(client));
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async lockClinic(id: string) { return this.query('SELECT id FROM "Clinic" WHERE id=$1 FOR UPDATE', [id]); }
  doctor = this.repository('Doctor');
  clinic = this.repository('Clinic');
  doctorSession = this.repository('DoctorSession');
  loginThrottle = this.repository('LoginThrottle');
  portalCase = this.repository('PortalCase');
  caseEvent = this.repository('CaseEvent');
  caseFile = this.repository('CaseFile');
  treatmentPlan = this.repository('TreatmentPlan');
  caseMessage = this.repository('CaseMessage');
  notification = this.repository('Notification');
  labAccess = this.repository('LabAccess');
  patient = this.repository('Patient');
  patientHistory = this.repository('PatientHistory');
  largeUploadSession = this.repository('LargeUploadSession');
  largeUploadChunk = this.repository('LargeUploadChunk');
  largeClinicalFile = this.repository('LargeClinicalFile');
}
export const db = new Database();
export async function closeDatabase() { if (globalDb.allenPool) { await globalDb.allenPool.end(); globalDb.allenPool = undefined; } }
