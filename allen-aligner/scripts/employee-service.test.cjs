const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

class PortalError extends Error { constructor(status, message) { super(message); this.status = status; } }
let permitted = true;
const filename = path.join(root, 'app/lib/employee-service.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
const ordinaryRequire = loaded.require.bind(loaded);
loaded.require = id => id === 'server-only' ? {} : id === './database' ? { db: {} } : id === './portal-http' ? { PortalError } : id === './hr-scope' ? {
  hrRequireEmployee: async () => { if (!permitted) throw new PortalError(404, 'Employee not found.'); },
  hrScope: user => ({ sql: '', args: [user.role, user.id] }),
} : ordinaryRequire(id);
loaded._compile(compiled, filename);
const { createEmployee, updateEmployee } = loaded.exports;
const actor = { id: '64c6a1a4-8f71-4db8-8bdb-59c75575dc51', role: 'HR_ADMIN' };
const requestId = '4b6632dd-1315-4394-8fc1-17c2ee080dfb';
// In-memory values only: this suite never connects to PostgreSQL or creates employee fixtures.
const fields = { fullName: 'Existing employee', email: 'existing@example.invalid', department: 'Existing department', designation: 'Existing designation', joinedOn: '2026-01-10', phone: '' };

function database() {
  const calls = [], receipts = new Map();
  let row = { id: 'ba1df13d-05d7-4e44-aa55-a7d04c6bdf1d', employeeCode: 'LEGACY-CODE', permanentId: 'AA-EMP-000001', ...fields, status: 'ACTIVE', createdAt: new Date('2026-01-10T00:00:00Z'), updatedAt: new Date('2026-01-10T00:00:00Z'), passwordHash: 'must-never-be-returned', secret: 'must-never-be-returned' };
  const db = {
    calls, receipts, emailDuplicate: false, grant: true, openExit: false, classification: true,
    transaction: async work => work(db),
    async query(sql, args = []) {
      calls.push({ sql, args });
      if (sql.startsWith('SELECT pg_advisory')) return [];
      if (sql.startsWith('SELECT "employeeId","actorId","payloadHash"')) return receipts.has(args[0]) ? [receipts.get(args[0])] : [];
      if (sql.startsWith('SELECT EXISTS')) return [{ department: db.classification, designation: db.classification }];
      if (sql.startsWith('SELECT 1 FROM "WorkHRGrant"')) return db.grant ? [{}] : [];
      if (sql.startsWith('SELECT id FROM "Employee"')) return db.emailDuplicate ? [{ id: 'existing' }] : [];
      if (sql.startsWith('SELECT id FROM "EmployeeOffboarding"')) return db.openExit ? [{ id: 'existing-exit' }] : [];
      if (sql.startsWith('INSERT INTO "Employee"(')) {
        row = { ...row, id: args[0], employeeCode: 'AA-EMP-000000012345', permanentId: 'AA-EMP-000000012345', fullName: args[1], email: args[2], department: args[3], designation: args[4], joinedOn: args[5], phone: args[6] };
        return [{ id: row.id }];
      }
      if (sql.startsWith('INSERT INTO "EmployeeRegistrationRequest"')) receipts.set(args[0], { employeeId: args[1], actorId: args[2], payloadHash: args[3] });
      if (sql.startsWith('SELECT e.id')) return [{ ...row }];
      if (sql.startsWith('UPDATE "Employee" SET')) row = { ...row, fullName: args[1], email: args[2], department: args[3], designation: args[4], joinedOn: args[5], phone: args[6], status: args[7] };
      return [];
    },
  };
  return db;
}

test('creation requires HR permission, required email/date and rejects identity or role injection', async () => {
  const db = database();
  await assert.rejects(createEmployee({ ...fields, requestId }, { ...actor, role: 'HR_VIEWER' }, db), { status: 403 });
  await assert.rejects(createEmployee({ ...fields, email: '', requestId }, actor, db), { status: 400 });
  await assert.rejects(createEmployee({ ...fields, joinedOn: '2026-02-30', requestId }, actor, db), { status: 400 });
  await assert.rejects(createEmployee({ ...fields, employeeCode: 'CLIENT-CODE', requestId }, actor, db), { status: 400 });
  await assert.rejects(createEmployee({ ...fields, role: 'HR_ADMIN', requestId }, actor, db), { status: 400 });
  assert.equal(db.calls.length, 0);
});

test('a repeated submission returns the same saved employee/code and inserts only once', async () => {
  const db = database();
  const first = await createEmployee({ ...fields, requestId }, actor, db);
  const replay = await createEmployee({ ...fields, requestId }, actor, db);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(first.employee.id, replay.employee.id);
  assert.equal(first.employee.employeeCode, 'AA-EMP-000000012345');
  assert.equal(db.calls.filter(c => c.sql.startsWith('INSERT INTO "Employee"(')).length, 1);
  assert.equal(JSON.stringify(first).includes('must-never-be-returned'), false);
  await assert.rejects(createEmployee({ ...fields, fullName: 'Changed payload', requestId }, actor, db), { status: 409 });
  await assert.rejects(createEmployee({ ...fields, requestId }, { ...actor, id: '327885d5-01a0-4fa3-9dd5-eb49934113bf' }, db), { status: 409 });
});

test('creation prevents existing email duplicates and invalid HR classification', async () => {
  const db = database(); db.emailDuplicate = true;
  await assert.rejects(createEmployee({ ...fields, requestId }, actor, db), { status: 409 });
  assert.equal(db.calls.some(c => c.sql.startsWith('INSERT INTO "Employee"(')), false);
  db.emailDuplicate = false; db.classification = false;
  await assert.rejects(createEmployee({ ...fields, requestId }, actor, db), { status: 400 });
});

test('officer receipt replay respects a later scope revocation', async () => {
  const db = database(), officer = { ...actor, role: 'HR_OFFICER' };
  await createEmployee({ ...fields, requestId }, officer, db);
  db.grant = false;
  await assert.rejects(createEmployee({ ...fields, requestId }, officer, db), { status: 404 });
});

test('editing preserves existing primary key/code and saves canonical actor/employee history', async () => {
  const db = database(), id = 'ba1df13d-05d7-4e44-aa55-a7d04c6bdf1d';
  const updated = await updateEmployee(id, { ...fields, designation: 'New designation', phone: '+1 555 0100' }, actor, db);
  assert.equal(updated.id, id);
  assert.equal(updated.employeeCode, 'LEGACY-CODE');
  assert.equal(updated.permanentId, 'AA-EMP-000001');
  assert.equal(db.calls.some(c => c.sql.startsWith('INSERT INTO "Employee"(')), false);
  const history = db.calls.find(c => c.sql.startsWith('INSERT INTO "EmployeePositionHistory"'));
  assert.equal(history.args[0], id);
  assert.equal(history.args[5], actor.id);
  const audit = db.calls.find(c => c.sql.startsWith('INSERT INTO "ManagementAudit"'));
  assert.equal(audit.args[2], id);
  const detail = JSON.parse(audit.args[3]);
  assert.equal(detail.before.phone, '');
  assert.equal(detail.after.phone, '+1 555 0100');
  assert.equal(JSON.stringify(detail).includes('must-never-be-returned'), false);
});

test('editing enforces officer scope/status policy and prevents offboarding bypass', async () => {
  const db = database(), id = 'ba1df13d-05d7-4e44-aa55-a7d04c6bdf1d';
  await assert.rejects(updateEmployee(id, { ...fields, status: 'INACTIVE' }, { ...actor, role: 'HR_OFFICER' }, db), { status: 403 });
  await assert.rejects(updateEmployee(id, { ...fields, status: 'OFFBOARDING' }, actor, db), { status: 409 });
  db.openExit = true;
  await assert.rejects(updateEmployee(id, { ...fields, status: 'INACTIVE' }, actor, db), { status: 409 });
  permitted = false;
  try { await assert.rejects(updateEmployee(id, fields, { ...actor, role: 'HR_OFFICER' }, db), { status: 404 }); }
  finally { permitted = true; }
});
