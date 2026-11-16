import Link from 'next/link';
import {redirect} from 'next/navigation';
import {currentHR} from '@/app/lib/hr-auth';
import {inventoryOverview} from '@/app/lib/inventory-management';
import {inventoryProcurementView} from '@/app/lib/inventory-procurement';
import {currentOwner} from '@/app/lib/owner-auth';
import InventoryManager from './inventory-manager';
import InventoryDashboard from './inventory-dashboard';
import ProcurementClient, {type InventoryProcurementData} from './procurement-client';
import '../clinical/review.css';
import './inventory.css';
export const dynamic='force-dynamic';
export default async function InventoryPage(){
 const actor=await currentHR();if(!actor)redirect('/hr/login');
 const [data,owner]=await Promise.all([inventoryOverview(actor),currentOwner()]);
 const procurement=await inventoryProcurementView(actor,!!owner&&owner.id===actor.id) as InventoryProcurementData;
 return <main className="clinical inventory-page">
 <header className="inventory-page-header"><div><span className="clinical-eyebrow">OPERATIONS · MATERIALS AND STOCK</span><h1>Inventory control</h1><p>Live supply visibility across stock, locations, lots, and activity.</p></div><nav aria-label="Inventory workspaces"><Link className="button" href="#procurement">Purchasing setup</Link><Link className="button" href="#inventory-actions">Record stock receipt</Link><Link className="button secondary" href="/owner/command-center">Owner command</Link><Link className="button secondary" href="/hr/suppliers">Suppliers</Link></nav></header>
 {data.ready?<><InventoryDashboard items={data.items} movements={data.movements} lots={data.lots} monthlyMovements={data.monthlyMovements} locationBalances={data.locationBalances} metrics={data.metrics}/><section className="inventory-start-guide" id="inventory-actions"><div><span className="inventory-eyebrow">GETTING STARTED</span><h2>How to add stock</h2><p>Add items and build the Warehouse → Zone → Rack → Bin location hierarchy. Then request purchasing below, receive delivered stock into Quarantine, and release only inspected stock into Available.</p><Link className="button secondary" href="#procurement">Open inventory setup</Link></div></section><div className="inventory-manager"><InventoryManager items={data.items} movements={data.movements} metrics={data.metrics} locations={data.locations} locationBalances={data.locationBalances} lots={data.lots} canWrite={data.canWrite}/></div><ProcurementClient initial={procurement}/></>:<section><h2>Inventory setup pending</h2><p>The inventory register is awaiting initial setup by the Owner.</p></section>}
 </main>;
}
