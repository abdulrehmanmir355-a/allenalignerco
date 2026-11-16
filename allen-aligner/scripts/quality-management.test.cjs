const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Load the actual services without opening a database connection or a Next server.
function service(name) {
  const filename = path.join(__dirname, '../app/lib', name + '.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const loaded = {exports: {}};
  class PortalError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const localRequire = id => {
    if (id === 'server-only') return {};
    if (id === './database') return {db: {query() {throw Error('Unexpected real database access');}}};
    if (id === './portal-http') return {PortalError};
    return require(id);
  };
  vm.runInNewContext(code, {require: localRequire, module: loaded, exports: loaded.exports}, {filename});
  return loaded.exports;
}
const {updateComplaint} = service('complaint-management');
const {updateCapa} = service('capa-management');
const id = '11111111-1111-4111-8111-111111111111';
const actor = {id, email: 'quality@example.test', role: 'HR_OFFICER'};
function database(status) {
  const writes = [];
  const db = {
    async transaction(fn) {return fn(db);},
    async query(sql, args) {
      if (sql.startsWith('SELECT')) return [{status, title: 'Original CAPA'}];
      writes.push({sql, args}); return [];
    },
  };
  return {db, writes};
}
const complaint = {
  receivedDate: '2026-10-30', source: 'INTERNAL', complainantName: 'Quality team',
  description: 'Product inspection complaint', riskLevel: 'HIGH', riskAssessment: 'Documented risk assessment',
  productReference: 'ALIGNER-1', investigationOwner: 'Quality officer',
  investigationFindings: 'Investigation findings recorded', rootCause: 'Root cause documented',
  capaRequired: false, capaRationale: 'Correction alone is sufficient',
  regulatoryOutcome: 'NOT_REPORTABLE', regulatoryAssessment: 'Assessment completed and documented',
  closureSummary: 'Closure evidence documented', actionNote: 'Quality review completed',
};
for (const stage of ['INVESTIGATING','CAPA_ASSESSMENT','REGULATORY_ASSESSMENT','CLOSURE_REVIEW','CLOSED']) {
  test(`complaint ${stage} rejects erased risk assessment without writes`, async () => {
    const {db, writes} = database(stage === 'CLOSED' ? 'CLOSURE_REVIEW' : stage);
    await assert.rejects(updateComplaint(id, {...complaint, status: stage, riskAssessment: ''}, actor, db), e => e.status === 409);
    assert.equal(writes.length, 0);
  });
}
test('complete complaint closure updates record and appends an audit event', async () => {
  const {db, writes} = database('CLOSURE_REVIEW');
  const result = await updateComplaint(id, {...complaint, status: 'CLOSED'}, actor, db);
  assert.equal(result.status, 'CLOSED'); assert.equal(writes.length, 2);
  assert.match(writes[1].sql, /QualityComplaintAudit/);
});
const capa = {
  sourceType: 'PROCESS', severity: 'HIGH', title: 'Inspection issue', description: 'Inspection nonconformance',
  assignedTo: 'Quality officer', dueDate: '2026-11-10', rootCause: 'Cause recorded',
  correctiveAction: 'Action recorded', preventiveAction: 'Prevention recorded',
  effectivenessCheck: 'Effectiveness verified', status: 'CLOSED', actionNote: 'Closure reviewed',
};
for (const field of ['rootCause','correctiveAction','preventiveAction']) {
  test(`CAPA closure rejects erased ${field} without writes`, async () => {
    const {db, writes} = database('VERIFYING');
    await assert.rejects(updateCapa(id, {...capa, [field]: ' '}, actor, db), e => e.status === 409);
    assert.equal(writes.length, 0);
  });
}
test('complete CAPA closure updates record and appends an audit event', async () => {
  const {db, writes} = database('VERIFYING');
  const result = await updateCapa(id, capa, actor, db);
  assert.equal(result.status, 'CLOSED'); assert.equal(writes.length, 2);
  assert.match(writes[1].sql, /CAPAAudit/);
});
test('viewer cannot update either quality register', async () => {
  for (const update of [updateComplaint, updateCapa]) {
    const {db, writes} = database('VERIFYING');
    await assert.rejects(update(id, {}, {...actor, role: 'HR_VIEWER'}, db), e => e.status === 403);
    assert.equal(writes.length, 0);
  }
});
