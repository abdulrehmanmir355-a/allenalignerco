const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
require('dotenv').config({path:path.join(root,'.env'),quiet:true});
require('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
const {Client}=require('pg');
async function main(){
 if(!process.env.DATABASE_URL)throw Error('Database configuration is missing.');
 const url=new URL(process.env.DATABASE_URL);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||decodeURIComponent(url.pathname.slice(1))!=='allen_aligner')throw Error('Inventory setup expects the local allen_aligner database.');
 const client=new Client({connectionString:url.toString()});await client.connect();
 try{
 const check=async()=> (await client.query(`SELECT to_regclass('public."InventoryItem"') IS NOT NULL AS items,to_regclass('public."InventoryMovement"') IS NOT NULL AS movements,to_regclass('public."InventoryStockState"') IS NOT NULL AS states,to_regclass('public."InventoryLocation"') IS NOT NULL AS locations,to_regclass('public."InventoryLocationBalance"') IS NOT NULL AS "locationBalances",to_regclass('public."Supplier"') IS NOT NULL AS suppliers,to_regclass('public."SupplierAudit"') IS NOT NULL AS "supplierAudits",(SELECT count(*)=2 FROM pg_attribute WHERE attrelid=to_regclass('public."InventoryLocation"') AND attname IN ('parentId','locationLevel') AND NOT attisdropped) AS "locationHierarchy",to_regclass('public."InventoryRequisition"') IS NOT NULL AND to_regclass('public."InventoryRFQ"') IS NOT NULL AND to_regclass('public."InventoryPurchaseOrder"') IS NOT NULL AND to_regclass('public."InventoryReceipt"') IS NOT NULL AND to_regclass('public."InventoryProcurementAudit"') IS NOT NULL AS procurement`)).rows[0];
 const before=await check();
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({schema:before,ready:before.items&&before.movements&&before.states&&before.locations&&before.locationBalances&&before.suppliers&&before.supplierAudits&&before.locationHierarchy&&before.procurement}));return;}
 const pgBin=process.env.PG_BIN||'C:/Program Files/PostgreSQL/17/bin';
 const dir=process.env.AA_INVENTORY_BACKUP_DIR||path.join(root,'.private','database-backups');fs.mkdirSync(dir,{recursive:true});
 const backup=path.join(dir,'inventory-'+new Date().toISOString().replace(/[:.]/g,'-')+'.dump');
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:'allen_aligner'};
 const run=(exe,args)=>{const result=spawnSync(path.join(pgBin,exe+'.exe'),args,{env,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});if(result.status!==0)throw Error(`${exe} failed: ${result.error?.message??result.stderr?.trim()??`exit ${result.status}`}.`);return result;};
 run('pg_dump',['--format=custom','--no-owner','--no-privileges','--file',backup]);
 const listing=run('pg_restore',['--list',backup]).stdout;
 if(!listing.includes('HRUser')||!listing.includes('PortalCase'))throw Error('Backup is missing expected base tables. Inventory schema was not changed.');
 await client.query(fs.readFileSync(path.join(root,'database/migrations/20261029170000_supplier_management.sql'),'utf8'));
 await client.query(fs.readFileSync(path.join(root,'database/migrations/20261030090000_inventory_management.sql'),'utf8'));
 await client.query(fs.readFileSync(path.join(root,'database/migrations/20261030120000_inventory_stock_states.sql'),'utf8'));
 await client.query(fs.readFileSync(path.join(root,'database/migrations/20261031150000_inventory_locations_lots.sql'),'utf8'));
 await client.query(fs.readFileSync(path.join(root,'database/migrations/20261112100000_inventory_location_hierarchy.sql'),'utf8'));
 await client.query(fs.readFileSync(path.join(root,'database/migrations/20261112120000_inventory_procurement.sql'),'utf8'));
 const after=await check();if(!after.items||!after.movements)throw Error('Inventory setup verification failed.');
 if(!after.states)throw Error('Inventory state setup verification failed.');
 if(!after.locations||!after.locationBalances)throw Error('Inventory location setup verification failed.');
 if(!after.locationHierarchy)throw Error('Warehouse hierarchy setup verification failed.');
 if(!after.procurement)throw Error('Inventory procurement setup verification failed.');
 if(!after.suppliers||!after.supplierAudits)throw Error('Supplier setup verification failed.');
 console.log(JSON.stringify({ready:true,backupValidated:true,backup,schema:after}));
 }finally{await client.end();}
}
main().catch(error=>{console.error('Inventory setup failed:',error instanceof Error?error.message:'Unknown error.');process.exitCode=1;});
