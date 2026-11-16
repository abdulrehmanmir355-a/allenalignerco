const test = require('node:test');
const assert = require('node:assert/strict');
const { patientSchema, patientData } = require('../app/lib/patient-validation.ts');
const valid = { patientCode: ' pat-001 ', fullName: '  Test   Patient  ' };
test('normalizes code and searchable fields without making names unique', () => {
  const data = patientData(patientSchema.parse({ ...valid, phone: '+92 (300) 123-4567', email: 'Test@Example.com' }));
  assert.equal(data.patientCode, 'PAT-001');
  assert.equal(data.normalizedName, 'test patient');
  assert.equal(data.normalizedPhone, '923001234567');
  assert.equal(data.normalizedEmail, 'test@example.com');
  assert.equal(data.dateOfBirth, null);
});
test('rejects invalid codes, fields and caller-supplied ownership', () => {
  for (const extra of [{patientCode:''}, {patientCode:'a b'}, {patientCode:'X'.repeat(41)}, {fullName:' '}, {email:'bad'}, {phone:'abcdefg'}, {clinicId:'other'}, {id:'other'}, {archivedAt:null}]) assert.equal(patientSchema.safeParse({...valid,...extra}).success, false);
});
test('checks calendar validity and future birth dates', () => {
  for (const dateOfBirth of ['2025-02-29','2024-02-30','2100-01-01','1899-12-31','invalid']) assert.equal(patientSchema.safeParse({...valid,dateOfBirth}).success, false);
  assert.equal(patientSchema.parse({...valid,dateOfBirth:'2024-02-29'}).dateOfBirth.toISOString(), '2024-02-29T00:00:00.000Z');
});

const { patientCreateSchema } = require('../app/lib/patient-validation.ts');
test('registration needs no manual ID and rejects caller-supplied IDs', () => {
  assert.equal(patientCreateSchema.safeParse({fullName:'New Patient'}).success,false);
  for (const extra of [{patientCode:'PAT-001'},{id:'forged'},{clinicId:'forged'}]) {
    assert.equal(patientCreateSchema.safeParse({fullName:'New Patient',email:'new@example.com',...extra}).success,false);
  }
});
test('new patient registration requires and normalizes a valid email', () => {
  assert.equal(patientCreateSchema.safeParse({fullName:'New Patient'}).success, false);
  for (const email of ['', 'not-an-email', 'name@', 'x'.repeat(250) + '@example.com']) {
    assert.equal(patientCreateSchema.safeParse({fullName:'New Patient', email}).success, false, `accepted invalid email: ${email}`);
  }
  const parsed = patientCreateSchema.parse({fullName:'New Patient', email:'  New.Patient@Example.COM  '});
  assert.equal(parsed.email, 'new.patient@example.com');
});
test('edits accept legacy blank emails but reject malformed nonblank email values', () => {
  const { patientEditSchema } = require('../app/lib/patient-validation.ts');
  assert.equal(patientEditSchema.safeParse({patientCode:'PAT-001',fullName:'Legacy Patient',email:'',revision:1}).success, true);
  assert.equal(patientEditSchema.safeParse({patientCode:'PAT-001',fullName:'Legacy Patient',email:'invalid',revision:1}).success, false);
  assert.equal(patientEditSchema.parse({patientCode:'PAT-001',fullName:'Legacy Patient',email:' Patient@Example.com ',revision:1}).email, 'patient@example.com');
});
const { patientArchiveSchema } = require('../app/lib/patient-validation.ts');
test('archive requests require a known action, current revision and no caller-supplied ownership', () => {
  assert.equal(patientArchiveSchema.safeParse({action:'ARCHIVE',revision:0}).success, true);
  assert.equal(patientArchiveSchema.safeParse({action:'RESTORE',revision:3}).success, true);
  for (const body of [
    {action:'DELETE',revision:0}, {action:'ARCHIVE'}, {action:'ARCHIVE',revision:-1},
    {action:'ARCHIVE',revision:1.5}, {action:'ARCHIVE',revision:'1'},
    {action:'ARCHIVE',revision:0,clinicId:'forged'}, {action:'ARCHIVE',revision:0,id:'forged'},
    {action:'ARCHIVE',revision:0,archivedAt:null},
  ]) assert.equal(patientArchiveSchema.safeParse(body).success, false, `accepted invalid archive request: ${JSON.stringify(body)}`);
});
