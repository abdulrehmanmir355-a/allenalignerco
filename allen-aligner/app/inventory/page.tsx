import Link from 'next/link';
import {redirect} from 'next/navigation';
import {currentHR} from '@/app/lib/hr-auth';
import {inventoryOverview} from '@/app/lib/inventory-management';
import InventoryManager from './inventory-manager';
import '../clinical/review.css';
export const dynamic='force-dynamic';
export default async function InventoryPage(){
 const actor=await currentHR();if(!actor)redirect('/hr/login');
 const data=await inventoryOverview(actor);
 return <main className="clinical" style={{maxWidth:1280,margin:'0 auto',padding:'32px 24px'}}>
 <header><div><span className="clinical-eyebrow">OPERATIONS · MATERIALS AND STOCK</span><h1>Inventory Management</h1><p>Track materials, record receipts and issues, and review low stock.</p></div><nav aria-label="Inventory workspaces"><Link className="button secondary" href="/owner/command-center">Owner Command</Link><Link className="button secondary" href="/hr/suppliers">Suppliers</Link></nav></header>
 {data.ready?<InventoryManager items={data.items} movements={data.movements} metrics={data.metrics} locations={data.locations} locationBalances={data.locationBalances} lots={data.lots} canWrite={data.canWrite}/>:<section><h2>Inventory setup pending</h2><p>The inventory register is awaiting initial setup by the Owner.</p></section>}
 </main>;
}
