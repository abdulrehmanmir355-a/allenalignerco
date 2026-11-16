const test=require('node:test');const assert=require('node:assert/strict');
const {validateFile,safeFilename,maxFileBytes}=require('../app/lib/file-validation.ts');
const {canPublishPlan,labTransitions}=require('../app/lib/lab-workflow.ts');
const {validateManufacturingHandoff}=require('../app/lib/doctor-approval-rules.mjs');
test('rejects disguised HTML and invalid uploads',()=>{assert.equal(validateFile('record.pdf',Buffer.from('<script>alert(1)</script>')),null);assert.equal(validateFile('record.exe',Buffer.from('%PDF-1.7')),null);assert.equal(validateFile('record.pdf',Buffer.alloc(maxFileBytes+1)),null);assert.equal(validateFile('empty.stl',Buffer.alloc(0)),null);});
test('recognizes allowed signatures and sanitizes names',()=>{assert.equal(validateFile('record.pdf',Buffer.from('%PDF-1.7')), 'application/pdf');assert.equal(validateFile('record.png',Buffer.from([137,80,78,71,13,10,26,10])), 'image/png');const stl=Buffer.alloc(134);stl.writeUInt32LE(1,80);assert.equal(validateFile('scan.stl',stl),'application/octet-stream');assert(!safeFilename('../a"\r\n.pdf').includes('"'));assert(!safeFilename('../a.pdf').includes('/'));});
test('lab cannot bypass doctor approval or overwrite review',()=>{assert.equal(canPublishPlan('REVIEW'),false);assert.equal(canPublishPlan('APPROVED'),false);assert.equal(canPublishPlan('CHANGES_REQUESTED'),true);assert.deepEqual(labTransitions.APPROVED,['IN_PRODUCTION']);assert.equal(labTransitions.REVIEW,undefined);});
test('doctor approval requires the matching automatically generated manufacturing order',()=>{
 const order={orderNumber:'MFG-QA-001',status:'MATERIAL_CHECK',planVersion:3,approvedDoctorId:'doctor-1',artifactSha256:'a'.repeat(64)};
 const input={setup:{ready:true,trigger:true},order,planVersion:3,doctorId:'doctor-1',artifactSha256:'a'.repeat(64)};
 assert.deepEqual(validateManufacturingHandoff(input),{allowed:true,orderNumber:'MFG-QA-001'});
 assert.deepEqual(validateManufacturingHandoff({...input,setup:{ready:true,trigger:false}}),{allowed:false,reason:'MANUFACTURING_SETUP_UNAVAILABLE'});
 assert.deepEqual(validateManufacturingHandoff({...input,order:null}),{allowed:false,reason:'MANUFACTURING_ORDER_MISMATCH'});
 assert.deepEqual(validateManufacturingHandoff({...input,order:{...order,status:'QUEUED'}}),{allowed:false,reason:'MANUFACTURING_ORDER_MISMATCH'});
 assert.deepEqual(validateManufacturingHandoff({...input,order:{...order,planVersion:2}}),{allowed:false,reason:'MANUFACTURING_ORDER_MISMATCH'});
 assert.deepEqual(validateManufacturingHandoff({...input,order:{...order,approvedDoctorId:'doctor-2'}}),{allowed:false,reason:'MANUFACTURING_ORDER_MISMATCH'});
 assert.deepEqual(validateManufacturingHandoff({...input,order:{...order,artifactSha256:'b'.repeat(64)}}),{allowed:false,reason:'MANUFACTURING_ORDER_MISMATCH'});
});
