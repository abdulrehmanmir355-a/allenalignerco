import 'server-only';
import {z} from 'zod';
import {db,type Database} from './database';
import {PortalError} from './portal-http';
import {inventoryBalance} from './inventory-policy';
export type InventoryActor={id:string;role:string}|null;
export const inventoryStates=['AVAILABLE','RESERVED','QUARANTINE','REJECTED','ISSUED','RETURNED'] as const;
export type InventoryState=typeof inventoryStates[number];
export type InventoryItem={id:string;sku:string;name:string;unit:string;reorderLevel:number;onHand:number;trackLot:boolean;trackExpiry:boolean;states:Record<InventoryState,number>};
export type InventoryLocation={id:string;code:string;name:string;kind:string};
export type InventoryLocationBalance={itemId:string;sku:string;name:string;unit:string;locationCode:string;locationName:string;available:number;reserved:number;quarantine:number;rejected:number;issued:number;returned:number};
export type InventoryLotSummary={id:string;itemId:string;sku:string;name:string;lotNumber:string;expiresOn:string|null;locationName:string;state:string;quantity:number};
export type InventoryMovement={id:string;itemId:string;sku:string;name:string;unit:string;kind:string;fromState:string|null;toState:string|null;quantity:number;balanceAfter:number;reference:string;note:string;actorEmail:string;createdAt:string;locationName:string|null;lotNumber:string|null};
export function inventoryCanWrite(actor:InventoryActor){return !!actor?.id&&['HR_ADMIN','HR_OFFICER'].includes(actor.role);}
function authorize(actor:InventoryActor,write=false):asserts actor is NonNullable<InventoryActor>{
 if(!actor?.id)throw new PortalError(401,'Please sign in to access inventory.');
 if(!['HR_ADMIN','HR_OFFICER','HR_VIEWER'].includes(actor.role)||write&&!inventoryCanWrite(actor))throw new PortalError(403,'Your account cannot perform this inventory action.');
}
const whole=z.number().int().min(0).max(1000000000);
const itemInput=z.object({sku:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,79}$/,'Use letters, numbers, dots, underscores or hyphens for the SKU.'),name:z.string().trim().min(2).max(200),unit:z.string().trim().min(1).max(40),reorderLevel:whole,trackLot:z.boolean().default(false),trackExpiry:z.boolean().default(false)}).strict().refine(v=>!v.trackExpiry||v.trackLot,'Expiry tracking requires lot tracking.');
const locationInput=z.object({code:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,59}$/),name:z.string().trim().min(2).max(160),kind:z.enum(['STORAGE','CLINIC','CABINET','QUARANTINE','OTHER']).default('STORAGE')}).strict();
const movementInput=z.object({requestId:z.uuid(),itemId:z.uuid(),locationId:z.uuid(),lotId:z.uuid().nullable().default(null),lotNumber:z.string().trim().max(120).default(''),expiresOn:z.string().trim().max(10).default(''),supplierReference:z.string().trim().max(200).default(''),kind:z.enum(['RECEIVE','ISSUE','RESERVE','UNRESERVE','QUARANTINE','RELEASE','REJECT','RETURN','RESTOCK','RETURN_QUARANTINE']),quantity:whole.min(1),reference:z.string().trim().max(200).default(''),note:z.string().trim().min(5,'Add a reason of at least five characters.').max(2000)}).strict();
const movementStates:Record<z.infer<typeof movementInput>['kind'],{from:InventoryState|null;to:InventoryState}>={
 RECEIVE:{from:null,to:'AVAILABLE'},ISSUE:{from:'AVAILABLE',to:'ISSUED'},RESERVE:{from:'AVAILABLE',to:'RESERVED'},UNRESERVE:{from:'RESERVED',to:'AVAILABLE'},
 QUARANTINE:{from:'AVAILABLE',to:'QUARANTINE'},RELEASE:{from:'QUARANTINE',to:'AVAILABLE'},REJECT:{from:'QUARANTINE',to:'REJECTED'},
 RETURN:{from:'ISSUED',to:'RETURNED'},RESTOCK:{from:'RETURNED',to:'AVAILABLE'},RETURN_QUARANTINE:{from:'RETURNED',to:'QUARANTINE'}
};
export async function inventoryReady(database:Database=db){
 const [row]=await database.query(`SELECT to_regclass('public."InventoryItem"') IS NOT NULL AND to_regclass('public."InventoryMovement"') IS NOT NULL AND to_regclass('public."InventoryStockState"') IS NOT NULL AND to_regclass('public."InventoryLocation"') IS NOT NULL AND to_regclass('public."InventoryLocationBalance"') IS NOT NULL AND to_regclass('public."InventoryLot"') IS NOT NULL AS ready`);
 return row?.ready===true;
}
async function requireSchema(database:Database){if(!await inventoryReady(database))throw new PortalError(503,'Inventory is awaiting database setup. Contact the Owner.');}
export async function inventoryOverview(actor:InventoryActor,database:Database=db){
 authorize(actor);
 if(!await inventoryReady(database))return {ready:false,items:[],movements:[],locations:[],locationBalances:[],lots:[],metrics:{items:0,lowStock:0,outOfStock:0},canWrite:inventoryCanWrite(actor)};
 const [rows,balances,events,totals,locations,lots,locationBalanceRows]=await Promise.all([
 database.query(`SELECT id,sku,name,unit,"reorderLevel","onHand","trackLot","trackExpiry" FROM "InventoryItem" ORDER BY lower(name),sku LIMIT 1000`),
 database.query(`SELECT "itemId",state,quantity FROM "InventoryStockState"`),
 database.query(`SELECT m.*,i.sku,i.name,i.unit,u.email AS "actorEmail",l.name AS "locationName",lot."lotNumber" FROM "InventoryMovement" m JOIN "InventoryItem" i ON i.id=m."itemId" JOIN "HRUser" u ON u.id=m."actorId" LEFT JOIN "InventoryLocation" l ON l.id=m."locationId" LEFT JOIN "InventoryLot" lot ON lot.id=m."lotId" ORDER BY m."createdAt" DESC,m.id DESC LIMIT 100`),
 database.query(`SELECT count(*)::int AS items,count(*) FILTER(WHERE "onHand"<="reorderLevel")::int AS "lowStock",count(*) FILTER(WHERE "onHand"=0)::int AS "outOfStock" FROM "InventoryItem"`),
 database.query(`SELECT id,code,name,kind FROM "InventoryLocation" WHERE active=true ORDER BY name LIMIT 500`),
 database.query(`SELECT l.id,l."itemId",i.sku,i.name,l."lotNumber",l."expiresOn"::text AS "expiresOn",loc.name AS "locationName",b.state,b.quantity FROM "InventoryLot" l JOIN "InventoryItem" i ON i.id=l."itemId" LEFT JOIN "InventoryLocationBalance" b ON b."lotId"=l.id LEFT JOIN "InventoryLocation" loc ON loc.id=b."locationId" WHERE b.quantity>0 ORDER BY l."expiresOn" NULLS LAST,l."lotNumber",loc.name LIMIT 2000`),
 database.query(`SELECT i.id AS "itemId",i.sku,i.name,i.unit,l.code AS "locationCode",l.name AS "locationName",sum(b.quantity) FILTER(WHERE b.state='AVAILABLE')::int AS available,sum(b.quantity) FILTER(WHERE b.state='RESERVED')::int AS reserved,sum(b.quantity) FILTER(WHERE b.state='QUARANTINE')::int AS quarantine,sum(b.quantity) FILTER(WHERE b.state='REJECTED')::int AS rejected,sum(b.quantity) FILTER(WHERE b.state='ISSUED')::int AS issued,sum(b.quantity) FILTER(WHERE b.state='RETURNED')::int AS returned FROM "InventoryLocationBalance" b JOIN "InventoryItem" i ON i.id=b."itemId" JOIN "InventoryLocation" l ON l.id=b."locationId" GROUP BY i.id,i.sku,i.name,i.unit,l.id,l.code,l.name ORDER BY lower(i.name),l.name LIMIT 5000`),
 ]);
 const statesByItem=new Map<string,Record<InventoryState,number>>();
 for(const row of balances){const itemId=String(row.itemId);const states=statesByItem.get(itemId)??{AVAILABLE:0,RESERVED:0,QUARANTINE:0,REJECTED:0,ISSUED:0,RETURNED:0};if((inventoryStates as readonly string[]).includes(String(row.state)))states[row.state as InventoryState]=Number(row.quantity);statesByItem.set(itemId,states);}
 const items:InventoryItem[]=rows.map(r=>({id:String(r.id),sku:String(r.sku),name:String(r.name),unit:String(r.unit),reorderLevel:Number(r.reorderLevel),onHand:Number(r.onHand),trackLot:r.trackLot===true,trackExpiry:r.trackExpiry===true,states:statesByItem.get(String(r.id))??{AVAILABLE:Number(r.onHand),RESERVED:0,QUARANTINE:0,REJECTED:0,ISSUED:0,RETURNED:0}}));
 const movements:InventoryMovement[]=events.map(r=>({id:String(r.id),itemId:String(r.itemId),sku:String(r.sku),name:String(r.name),unit:String(r.unit),kind:String(r.kind),fromState:r.fromState===null?null:String(r.fromState),toState:r.toState===null?null:String(r.toState),quantity:Number(r.quantity),balanceAfter:Number(r.balanceAfter),reference:String(r.reference),note:String(r.note),actorEmail:String(r.actorEmail),createdAt:new Date(String(r.createdAt)).toISOString(),locationName:r.locationName===null?null:String(r.locationName),lotNumber:r.lotNumber===null?null:String(r.lotNumber)}));
 return {ready:true,items,movements,locations:locations.map(r=>({id:String(r.id),code:String(r.code),name:String(r.name),kind:String(r.kind)})) as InventoryLocation[],locationBalances:locationBalanceRows.map(r=>({itemId:String(r.itemId),sku:String(r.sku),name:String(r.name),unit:String(r.unit),locationCode:String(r.locationCode),locationName:String(r.locationName),available:Number(r.available??0),reserved:Number(r.reserved??0),quarantine:Number(r.quarantine??0),rejected:Number(r.rejected??0),issued:Number(r.issued??0),returned:Number(r.returned??0)})) as InventoryLocationBalance[],lots:lots.map(r=>({id:String(r.id),itemId:String(r.itemId),sku:String(r.sku),name:String(r.name),lotNumber:String(r.lotNumber),expiresOn:r.expiresOn===null?null:String(r.expiresOn),locationName:r.locationName===null?'—':String(r.locationName),state:String(r.state),quantity:Number(r.quantity)})) as InventoryLotSummary[],metrics:{items:Number(totals[0]?.items??0),lowStock:Number(totals[0]?.lowStock??0),outOfStock:Number(totals[0]?.outOfStock??0)},canWrite:inventoryCanWrite(actor)};
}
export async function createInventoryItem(body:unknown,actor:InventoryActor,database:Database=db){
 authorize(actor,true);const parsed=itemInput.safeParse(body);if(!parsed.success)throw new PortalError(400,parsed.error.issues[0]?.message??'Check the item details.');
 await requireSchema(database);const v=parsed.data;
 try{return await database.transaction(async tx=>{const [item]=await tx.query(`INSERT INTO "InventoryItem"(sku,name,unit,"reorderLevel","trackLot","trackExpiry","createdBy") VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[v.sku,v.name,v.unit,v.reorderLevel,v.trackLot,v.trackExpiry,actor.id]);await tx.query(`INSERT INTO "InventoryStockState"("itemId",state,quantity) SELECT $1,state,0 FROM (VALUES ('AVAILABLE'),('RESERVED'),('QUARANTINE'),('REJECTED'),('ISSUED'),('RETURNED')) AS s(state)`,[item.id]);return {id:String(item.id)};});}
 catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='23505')throw new PortalError(409,'This SKU already exists.');throw error;}
}
export async function createInventoryLocation(body:unknown,actor:InventoryActor,database:Database=db){
 authorize(actor,true);const parsed=locationInput.safeParse(body);if(!parsed.success)throw new PortalError(400,parsed.error.issues[0]?.message??'Check the location details.');await requireSchema(database);const v=parsed.data;
 try{const [row]=await database.query(`INSERT INTO "InventoryLocation"(code,name,kind) VALUES($1,$2,$3) RETURNING id`,[v.code,v.name,v.kind]);return {id:String(row.id)};}
 catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='23505')throw new PortalError(409,'This location code already exists.');throw error;}
}
export async function recordInventoryMovement(body:unknown,actor:InventoryActor,database:Database=db){
 authorize(actor,true);const parsed=movementInput.safeParse(body);if(!parsed.success)throw new PortalError(400,parsed.error.issues[0]?.message??'Check the stock movement.');
 await requireSchema(database);const v=parsed.data;
 try{return await database.transaction(async tx=>{
 const [item]=await tx.query(`SELECT id,"onHand","trackLot","trackExpiry" FROM "InventoryItem" WHERE id=$1 FOR UPDATE`,[v.itemId]);if(!item)throw new PortalError(404,'Inventory item not found.');
 const [location]=await tx.query(`SELECT id FROM "InventoryLocation" WHERE id=$1 AND active=true`,[v.locationId]);if(!location)throw new PortalError(404,'Select an active stock location.');
 const stateChange=movementStates[v.kind];
 let lotId:string|null=v.lotId;
 if(item.trackLot&&v.kind==='RECEIVE'){
   if(!v.lotNumber)throw new PortalError(400,'This item requires a lot number for receipts.');
   if(item.trackExpiry&&!/^\d{4}-\d{2}-\d{2}$/.test(v.expiresOn))throw new PortalError(400,'Enter the expiry date for this lot.');
   if(v.expiresOn){const exp=new Date(v.expiresOn+'T00:00:00Z');if(Number.isNaN(exp.getTime())||exp.toISOString().slice(0,10)!==v.expiresOn)throw new PortalError(400,'Enter a valid expiry date.');if(v.expiresOn<new Date().toISOString().slice(0,10))throw new PortalError(409,'Expired stock cannot be received as available stock.');}
   const [existing]=await tx.query(`SELECT id,"expiresOn"::text AS "expiresOn" FROM "InventoryLot" WHERE "itemId"=$1 AND "lotNumberNormalized"=upper(btrim($2)) FOR UPDATE`,[v.itemId,v.lotNumber]);
   if(existing){if((existing.expiresOn??'')!==(v.expiresOn||''))throw new PortalError(409,'That lot number already exists with a different expiry date.');lotId=String(existing.id);}
   else{const [lot]=await tx.query(`INSERT INTO "InventoryLot"("itemId","lotNumber","expiresOn","supplierReference") VALUES($1,$2,$3,$4) RETURNING id`,[v.itemId,v.lotNumber,v.expiresOn||null,v.supplierReference]);lotId=String(lot.id);}
 }
 if(item.trackLot&&!lotId)throw new PortalError(400,'Select a lot for this stock movement.');
 if(!item.trackLot&&lotId)throw new PortalError(400,'This item does not use lot tracking.');
 if(lotId){const [lot]=await tx.query(`SELECT id,"expiresOn"::text AS "expiresOn" FROM "InventoryLot" WHERE id=$1 AND "itemId"=$2`,[lotId,v.itemId]);if(!lot)throw new PortalError(404,'The selected lot does not belong to this item.');if(item.trackExpiry&&lot.expiresOn&&lot.expiresOn<new Date().toISOString().slice(0,10)&&['ISSUE','RESERVE','RESTOCK'].includes(v.kind))throw new PortalError(409,'Expired stock cannot be issued or reserved. Quarantine or reject it instead.');}
 const [prior]=await tx.query(`SELECT * FROM "InventoryMovement" WHERE "requestId"=$1`,[v.requestId]);
 if(prior){if(prior.itemId!==v.itemId||prior.actorId!==actor.id||prior.kind!==v.kind||Number(prior.quantity)!==v.quantity||prior.reference!==v.reference||prior.note!==v.note||prior.locationId!==v.locationId||String(prior.lotId??'')!==String(lotId??''))throw new PortalError(409,'This request was already used for a different movement.');return {id:String(prior.id),balanceAfter:Number(prior.balanceAfter),duplicate:true};}
 let sourceBalance=0,destinationBalance=0;
 if(stateChange.from){const [source]=await tx.query(`UPDATE "InventoryStockState" SET quantity=quantity-$3,"updatedAt"=now() WHERE "itemId"=$1 AND state=$2 AND quantity >= $3 RETURNING quantity`,[v.itemId,stateChange.from,v.quantity]);if(!source)throw new PortalError(409,`Insufficient ${stateChange.from.toLowerCase()} stock.`);sourceBalance=Number(source.quantity);}
 const [destination]=await tx.query(`UPDATE "InventoryStockState" SET quantity=quantity+$3,"updatedAt"=now() WHERE "itemId"=$1 AND state=$2 AND quantity <= 1000000000-$3 RETURNING quantity`,[v.itemId,stateChange.to,v.quantity]);if(!destination)throw new PortalError(409,'This movement exceeds the supported stock limit.');destinationBalance=Number(destination.quantity);
 if(stateChange.from){const [source]=await tx.query(`UPDATE "InventoryLocationBalance" SET quantity=quantity-$5,"updatedAt"=now() WHERE "itemId"=$1 AND "locationId"=$2 AND "lotId" IS NOT DISTINCT FROM $3::uuid AND state=$4 AND quantity >= $5 RETURNING quantity`,[v.itemId,v.locationId,lotId,stateChange.from,v.quantity]);if(!source)throw new PortalError(409,'Not enough stock in the selected location and lot.');}
 const localDestination=await tx.query(`INSERT INTO "InventoryLocationBalance"("itemId","locationId","lotId",state,quantity) VALUES($1,$2,$3,$4,$5) ON CONFLICT ("itemId","locationId","lotId",state) DO UPDATE SET quantity="InventoryLocationBalance".quantity+EXCLUDED.quantity,"updatedAt"=now() WHERE "InventoryLocationBalance".quantity <= 1000000000-EXCLUDED.quantity RETURNING quantity`,[v.itemId,v.locationId,lotId,stateChange.to,v.quantity]);if(!localDestination.length)throw new PortalError(409,'This location balance exceeds the supported stock limit.');
 const balance=stateChange.to==='AVAILABLE'?destinationBalance:stateChange.from==='AVAILABLE'?sourceBalance:Number(item.onHand);
 if(stateChange.from==='AVAILABLE'||stateChange.to==='AVAILABLE')await tx.query(`UPDATE "InventoryItem" SET "onHand"=$2,"updatedAt"=now() WHERE id=$1`,[v.itemId,balance]);
 const [movement]=await tx.query(`INSERT INTO "InventoryMovement"("itemId","requestId",kind,"fromState","toState",quantity,"balanceAfter",reference,note,"actorId","locationId","lotId") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[v.itemId,v.requestId,v.kind,stateChange.from,stateChange.to,v.quantity,balance,v.reference,v.note,actor.id,v.locationId,lotId]);
 return {id:String(movement.id),balanceAfter:balance,duplicate:false};
 });}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='23505')throw new PortalError(409,'This movement request is already recorded. Refresh the register.');throw error;}
}
