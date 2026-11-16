import 'server-only';
import {currentLocalModule} from './local-module-auth';
import {db} from './database';
import {hash} from 'bcryptjs';
import {randomBytes} from 'node:crypto';
export async function currentFinance(){return currentLocalModule('finance');}
export async function financeActionActor(){
 const actor=await currentFinance();if(!actor)return null;
 const email='local-finance-'+actor.id+'@local.invalid';
 const rows=await db.query('SELECT id,email,"isActive" FROM "HRUser" WHERE id=$1',[actor.id]) as {id:string;email:string;isActive:boolean}[];
 if(rows.length&&(rows[0].email!==email||rows[0].isActive))throw new Error('Finance audit identity conflict.');
 if(!rows.length){
  const passwordHash=await hash(randomBytes(48).toString('base64url'),12);
  await db.query(`INSERT INTO "HRUser"(id,"fullName",email,"passwordHash",role,"isActive") VALUES($1,$2,$3,$4,'HR_ADMIN',FALSE)`,[actor.id,'Local finance audit actor',email,passwordHash]);
 }
 return actor;
}
