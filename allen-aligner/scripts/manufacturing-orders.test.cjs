const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const crypto=require('node:crypto');

class PortalError extends Error{constructor(status,message){super(message);this.status=status;}}

function load(name){
 const filename=path.join(__dirname,'../app/lib',name+'.ts'),loaded={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports:loaded.exports,module:loaded,require:id=>{
  if(id==='server-only')return {};
  if(id==='./database')return {db:{}};
  if(id==='./portal-http')return {PortalError};
  if(id==='./case-activity')return {recordCaseActivity:async()=>{}};
  if(id==='./case-intake')return {decodeCaseIntake:value=>({notes:value,intake:null}),decodeRecordFilename:value=>({filename:value,recordType:null})};
  return require(id);
 }},{filename});
 return loaded.exports;
}

const {manageManufacturingOrder}=load('manufacturing-orders');
const orderId='11111111-1111-4111-8111-111111111111';
const itemId='22222222-2222-4222-8222-222222222222';
const actor={id:'33333333-3333-4333-8333-333333333333',email:'qa@example.invalid',role:'HR_ADMIN'};

function database({available=20,queuePosition=5}={}){
 const order={id:orderId,orderNumber:'MFG-QA-001',caseId:'case-qa',clinicId:'clinic-qa',status:'MATERIAL_CHECK',planVersion:1,currentVersion:1,latestVersion:1,decision:'APPROVED',approvedDoctorId:'doctor-qa',approvedByDoctorId:'doctor-qa',artifactSha256:'a'.repeat(64),clinicalApproved:true,doctorApprovalRecorded:true,materialCheckedAt:null,commercialCheckedAt:null,capacityCheckedAt:null};
 const state={available,reserved:0,locationAvailable:available,locationReserved:0,materials:[],reservations:[],audits:[],queuePosition:null,costing:null,movements:[],stages:[]};
 const db={
  async transaction(work){return work(db);},
  async query(sql,args=[]){
   if(sql.includes('FROM "ManufacturingOrder" mo JOIN'))return [{...order}];
   if(sql.startsWith('SELECT res.id::text AS id,res."materialId"')){
    return state.reservations.filter(reservation=>!reservation.releaseMovementId).map(reservation=>({
     id:reservation.id,materialId:reservation.materialId,quantityReserved:reservation.quantity,
     itemId:reservation.itemId,locationId:reservation.locationId,lotId:reservation.lotId,name:'Aligner sheet',
    }));
   }
   if(sql.startsWith('SELECT id FROM "InventoryItem" WHERE id=ANY'))return args[0].map(id=>({id}));
   if(sql.startsWith('SELECT id FROM "InventoryItem"'))return args[0]===itemId?[{id:itemId}]:[];
   if(sql.startsWith('SELECT m.id::text AS id'))return state.materials.map(material=>({...material,id:material.id,itemId:material.itemId,trackLot:false,trackExpiry:false}));
   if(sql.startsWith('SELECT b.id,b."locationId"'))return state.locationAvailable?[{id:'available-balance',locationId:'location-qa',lotId:null,quantity:state.locationAvailable,locationName:'Main',expiresOn:null}]:[];
   if(sql.startsWith('UPDATE "InventoryStockState"')){
    const target=sql.includes("state='AVAILABLE'")?'available':'reserved',amount=Number(args[1]);
    if(sql.includes('quantity=quantity-')){if(state[target]<amount)return [];state[target]-=amount;}
    else state[target]+=amount;
    return [{quantity:state[target]}];
   }
   if(sql.startsWith('UPDATE "InventoryItem"'))return [{id:itemId}];
   if(sql.startsWith('UPDATE "InventoryLocationBalance" SET quantity=quantity-$2')){
    const amount=Number(args[1]),reserved=sql.includes("state='RESERVED'");
    const key=reserved?'locationReserved':'locationAvailable';
    if(state[key]<amount)return [];state[key]-=amount;return [{quantity:state[key]}];
   }
   if(sql.startsWith('INSERT INTO "InventoryLocationBalance"')){
    const amount=Number(args[3]),reserved=sql.includes("'RESERVED'");
    state[reserved?'locationReserved':'locationAvailable']+=amount;return [{id:'balance'}];
   }
   if(sql.startsWith('INSERT INTO "InventoryMovement"')){
    const id=crypto.randomUUID();state.movements.push({id,sql,args});return [{id}];
   }
   if(sql.startsWith('UPDATE "ManufacturingOrderReservation" SET "releaseMovementId"')){const reservation=state.reservations.find(row=>row.id===args[0]);if(reservation)reservation.releaseMovementId=args[1];return [];}
   if(sql.startsWith('INSERT INTO "ManufacturingOrderReservation"')){state.reservations.push({materialId:args[1],movementId:args[2],quantity:args[3]});return [];}
   if(sql.startsWith('DELETE FROM "ManufacturingOrderMaterial"')){state.materials=[];return [];}
   if(sql.startsWith('INSERT INTO "ManufacturingOrderMaterial"')){state.materials.push({id:crypto.randomUUID(),itemId:args[1],quantityRequired:args[2],name:'Aligner sheet'});return [];}
   if(sql.startsWith('UPDATE "ManufacturingOrder" SET status=')){
    if(sql.includes("status='COMMERCIAL_CHECK'")){order.status='COMMERCIAL_CHECK';order.materialCheckedBy=args[1];order.materialCheckedAt=new Date();order.materialEvidence=args[2];}
    else if(sql.includes("status='CAPACITY_CHECK'")){order.status='CAPACITY_CHECK';order.commercialReference=args[1];order.commercialEvidence=args[2];order.commercialCheckedBy=args[3];order.commercialCheckedAt=new Date();}
    else if(sql.includes("status='QUEUED'")){order.status='QUEUED';order.workCenter=args[1];order.capacityReference=args[2];order.scheduledFor=args[3];order.dueDate=args[4];order.capacityCheckedBy=args[5];order.capacityCheckedAt=new Date();order.queuePosition=args[6];state.queuePosition=args[6];}
    return [];
   }
   if(sql.includes('pg_advisory_xact_lock'))return [];
   if(sql.startsWith('SELECT coalesce(max("queuePosition")'))return [{next:queuePosition+1}];
   if(sql.startsWith('SELECT coalesce(max(sequence),0)+1 AS next FROM "ManufacturingStageRecord"'))return [{next:state.stages.length+1}];
   if(sql.startsWith('INSERT INTO "ManufacturingStageRecord"')){
    const stage={id:crypto.randomUUID(),sequence:Number(args[1]),stageName:args[2],operatorName:args[3],machineName:args[4],materialUsed:args[5],durationMinutes:Number(args[6]),result:args[7],notes:args[8]};
    state.stages.push(stage);return [{id:stage.id,createdAt:new Date()}];
   }
   if(sql.startsWith('UPDATE "ManufacturingOrder" SET currency=')){state.costing={currency:args[1],materialCost:Number(args[2]),laborCost:Number(args[3]),otherCost:Number(args[4]),totalCost:Number(args[5])};return [];}
   if(sql.startsWith('INSERT INTO "ManufacturingOrderAudit"')){state.audits.push({action:args[1],detail:JSON.parse(args[5])});return [];}
   throw new Error('Unexpected manufacturing test query: '+sql);
  }
 };
 return {db,order,state};
}

test('manufacturing checks advance only in material, commercial, capacity, queue order',async()=>{
 const {db,order,state}=database();
 await assert.rejects(manageManufacturingOrder({action:'commercial_check',orderId,reference:'Q-1',evidence:'Verified quote'},actor,db),error=>error.status===409);
 await manageManufacturingOrder({action:'set_materials',orderId,materials:[{itemId,quantity:4}]},actor,db);
 assert.equal(order.status,'MATERIAL_CHECK');
 await manageManufacturingOrder({action:'check_materials',orderId,evidence:'Approved plan bill of materials verified'},actor,db);
 assert.equal(order.status,'COMMERCIAL_CHECK');
 assert.equal(state.available,16);
 assert.equal(state.reserved,4);
 assert.equal(state.locationAvailable,16);
 assert.equal(state.locationReserved,4);
 assert.equal(state.reservations.length,1);
 await assert.rejects(manageManufacturingOrder({action:'set_materials',orderId,materials:[{itemId,quantity:2}]},actor,db),error=>error.status===409);
 await manageManufacturingOrder({action:'commercial_check',orderId,reference:'QUOTE-42',evidence:'Commercial terms verified'},actor,db);
 assert.equal(order.status,'CAPACITY_CHECK');
 await assert.rejects(manageManufacturingOrder({action:'capacity_check',orderId,workCenter:'Printer 1',capacityReference:'Slot 9',scheduledFor:'2026-11-20',dueDate:'2026-11-19'},actor,db),error=>error.status===400);
 assert.equal(order.status,'CAPACITY_CHECK');
 const result=await manageManufacturingOrder({action:'capacity_check',orderId,workCenter:'Printer 1',capacityReference:'Slot 9',scheduledFor:'2026-11-20',dueDate:'2026-11-25'},actor,db);
 assert.equal(order.status,'QUEUED');
 assert.equal(order.queuePosition,6);
 assert.match(result.message,/position 6/);
 assert.deepEqual(state.audits.map(entry=>entry.action),['MATERIAL_REQUIREMENTS_SET','MATERIAL_CHECK_PASSED','COMMERCIAL_CHECK_PASSED','CAPACITY_CONFIRMED_AND_QUEUED']);
});

test('material reservation rejects shortages without advancing the order',async()=>{
 const {db,order,state}=database({available:3});
 await manageManufacturingOrder({action:'set_materials',orderId,materials:[{itemId,quantity:4}]},actor,db);
 await assert.rejects(manageManufacturingOrder({action:'check_materials',orderId,evidence:'Approved plan bill of materials verified'},actor,db),error=>error.status===409);
 assert.equal(order.status,'MATERIAL_CHECK');
 assert.equal(state.available,3);
 assert.equal(state.reserved,0);
 assert.equal(state.movements.length,0);
});

test('costing is available only after queueing and records a summed total',async()=>{
 const {db,order,state}=database();
 const costing={action:'cost',orderId,currency:'pkr',materialCost:12.34,laborCost:5.25,otherCost:1.41};
 await assert.rejects(manageManufacturingOrder(costing,actor,db),error=>error.status===409);
 order.status='QUEUED';
 const result=await manageManufacturingOrder(costing,actor,db);
 assert.deepEqual(state.costing,{currency:'PKR',materialCost:12.34,laborCost:5.25,otherCost:1.41,totalCost:19});
 assert.equal(result.message,'Order costing recorded.');
 assert.equal(state.audits.at(-1).action,'COSTING_RECORDED');
});

test('production stages are append-only and available only for queued orders',async()=>{
 const {db,order,state}=database();
 const first={action:'record_stage',orderId,stageName:'Thermoforming',operatorName:'Operator One',machineName:'Former 1',materialUsed:'PETG sheet',durationMinutes:18,result:'PASS',notes:'Within tolerance'};
 await assert.rejects(manageManufacturingOrder(first,actor,db),error=>error.status===409);
 assert.equal(state.stages.length,0);

 order.status='QUEUED';
 const firstResult=await manageManufacturingOrder(first,actor,db);
 const secondResult=await manageManufacturingOrder({...first,stageName:'Trimming',result:'REWORK',notes:'Edge requires a second pass'},actor,db);

 assert.equal(firstResult.message,'Stage 1 recorded in the manufacturing history.');
 assert.equal(secondResult.message,'Stage 2 recorded in the manufacturing history.');
 assert.deepEqual(state.stages.map(stage=>[stage.sequence,stage.stageName,stage.result]),[
  [1,'Thermoforming','PASS'],
  [2,'Trimming','REWORK'],
 ]);
 assert.deepEqual(state.audits.slice(-2).map(entry=>entry.action),['PRODUCTION_STAGE_RECORDED','PRODUCTION_STAGE_RECORDED']);
});

test('superseded orders release held stock once back to available inventory',async()=>{
 const {db,order,state}=database();
 order.status='SUPERSEDED';
 state.available=16;state.reserved=4;state.locationAvailable=16;state.locationReserved=4;
 state.reservations.push({
  id:'reservation-qa',materialId:'material-qa',itemId,locationId:'location-qa',lotId:null,quantity:4,
 });
 const result=await manageManufacturingOrder({action:'release_superseded_materials',orderId},actor,db);

 assert.equal(result.message,'Released 1 held material reservation to available inventory.');
 assert.equal(state.available,20);
 assert.equal(state.reserved,0);
 assert.equal(state.locationAvailable,20);
 assert.equal(state.locationReserved,0);
 assert.ok(state.reservations[0].releaseMovementId);
 assert.equal(state.movements.length,1);
 assert.match(state.movements[0].sql,/'UNRESERVE','RESERVED','AVAILABLE'/);
 assert.equal(state.movements[0].args[3],20);

 const repeated=await manageManufacturingOrder({action:'release_superseded_materials',orderId},actor,db);
 assert.equal(repeated.message,'Released 0 held material reservations to available inventory.');
 assert.equal(state.movements.length,1);
});

test('stale approvals and unauthorized roles cannot change manufacturing orders',async()=>{
 const {db,order,state}=database();
 await assert.rejects(manageManufacturingOrder({action:'set_materials',orderId,materials:[{itemId,quantity:4}]},{...actor,role:'HR_VIEWER'},db),error=>error.status===403);
 order.latestVersion=2;
 await assert.rejects(manageManufacturingOrder({action:'set_materials',orderId,materials:[{itemId,quantity:4}]},actor,db),error=>error.status===409);
 assert.equal(state.materials.length,0);
 assert.equal(state.audits.length,0);
});