import type { InventoryItem, InventoryLocationBalance, InventoryLotSummary, InventoryMonthlyMovement, InventoryMovement } from "@/app/lib/inventory-management";

type Metrics = { items: number; lowStock: number; outOfStock: number; unitsAvailable: number; unitsReserved: number; unitsQuarantined: number };
const number = new Intl.NumberFormat("en-US");
const pieColors = ["#123c88", "#1b55b4", "#2563eb", "#3981ed", "#5a9bf2", "#8bbbf7", "#b7d3fb"];
const states = [
  ["Available", "AVAILABLE", "available"], ["Reserved", "RESERVED", "reserved"], ["Quarantined", "QUARANTINE", "quarantined"],
  ["Rejected", "REJECTED", "rejected"], ["Issued", "ISSUED", "issued"], ["Returned", "RETURNED", "returned"],
] as const;

export default function InventoryDashboard({ items, lots, movements, monthlyMovements, locationBalances, metrics }: { items: InventoryItem[]; lots: InventoryLotSummary[]; movements: InventoryMovement[]; monthlyMovements: InventoryMonthlyMovement[]; locationBalances: InventoryLocationBalance[]; metrics: Metrics }) {
  const currentMonthParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const currentYear = Number(currentMonthParts.find(part => part.type === "year")?.value);
  const currentMonth = Number(currentMonthParts.find(part => part.type === "month")?.value);
  const trend = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(Date.UTC(currentYear, currentMonth - 1 - (5 - index), 1));
    const month = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
    return monthlyMovements.find(row => row.month === month) ?? { month, received: 0, issued: 0 };
  });
  const maxMonthly = Math.max(1, ...trend.flatMap(row => [row.received, row.issued]));
  const today = new Date();
  const soon = new Date(today); soon.setDate(soon.getDate() + 90);
  const expiryAlerts = Array.from(new Map(lots.filter(lot => lot.expiresOn && new Date(`${lot.expiresOn}T00:00:00`) <= soon).map(lot => [lot.id, lot])).values()).sort((a, b) => (a.expiresOn || "").localeCompare(b.expiresOn || "")).slice(0, 5);
  const lowStock = items.filter(item => item.states.AVAILABLE <= item.reorderLevel).sort((a, b) => a.states.AVAILABLE - b.states.AVAILABLE).slice(0, 5);
  const stateTotals = states.map(([label, key, color]) => ({ label, color, quantity: items.reduce((sum, item) => sum + item.states[key], 0) }));
  const maxState = Math.max(1, ...stateTotals.map(row => row.quantity));
  const locationTotals = Array.from(locationBalances.reduce((total, row) => total.set(row.locationName, (total.get(row.locationName) || 0) + row.available), new Map<string, number>()).entries()).map(([name, quantity]) => ({ name, quantity })).filter(row => row.quantity > 0).sort((a, b) => b.quantity - a.quantity).slice(0, 6);
  const allLocationTotals = Array.from(locationBalances.reduce((total, row) => total.set(row.locationName, (total.get(row.locationName) || 0) + row.available), new Map<string, number>()).entries()).map(([name, quantity]) => ({ name, quantity })).filter(row => row.quantity > 0).sort((a, b) => b.quantity - a.quantity);
  const visibleLocationNames = new Set(locationTotals.map(row => row.name));
  const otherLocationQuantity = allLocationTotals.filter(row => !visibleLocationNames.has(row.name)).reduce((sum, row) => sum + row.quantity, 0);
  const maxLocation = Math.max(1, ...locationTotals.map(row => row.quantity));
  const topItems = [...items].filter(item => item.states.AVAILABLE > 0).sort((a, b) => b.states.AVAILABLE - a.states.AVAILABLE).slice(0, 6);
  const maxItem = Math.max(1, ...topItems.map(item => item.states.AVAILABLE));
  const statePie = stateTotals.map(row => ({ label: row.label, value: row.quantity })).filter(row => row.value > 0);
  const locationPie = [...locationTotals.map(row => ({ label: row.name, value: row.quantity })), ...(otherLocationQuantity ? [{ label: "Other locations", value: otherLocationQuantity }] : [])];
  function pieBackground(data: { label: string; value: number }[]) {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (!total) return "#e8eef6";
    let position = 0;
    const slices = data.map((item, index) => { const start = position; position += item.value / total * 100; return `${pieColors[index % pieColors.length]} ${start}% ${position}%`; });
    return `conic-gradient(${slices.join(", ")})`;
  }
  function pieCard(title: string, description: string, data: { label: string; value: number }[]) {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const chartName = data.map((item, index) => `${item.label} ${number.format(item.value)} (${Math.round(item.value / (total || 1) * 100)}%)`).join(", ");
    return <section className="inventory-pie-card"><div className="inventory-card-heading"><div><h3>{title}</h3><p>{description}</p></div></div><div className="inventory-pie-body">{total ? <><div className="inventory-pie" role="img" aria-label={`${title}: ${chartName}`} style={{ background: pieBackground(data) }} /><ul className="inventory-pie-legend">{data.map((item, index) => <li key={item.label}><i style={{ background: pieColors[index % pieColors.length] }} /><span>{item.label}</span><strong>{number.format(item.value)} · {Math.round(item.value / total * 100)}%</strong></li>)}</ul></> : <p className="inventory-empty">No stock has been recorded for this chart yet.</p>}</div></section>;
  }
  return <section className="inventory-dashboard" aria-label="Inventory operations dashboard">
    <div className="inventory-dashboard-head">
      <div><span className="inventory-eyebrow">ALLEN ALIGNER · OPERATIONS</span><h2>Inventory control</h2><p>Live stock position, movement trends, and supply alerts.</p></div>
      <div className="inventory-live"><span /> Live register</div>
    </div>
    <div className="inventory-kpis">
      <article><span>Catalog items</span><strong>{number.format(metrics.items)}</strong><small>Active stock codes</small></article>
      <article><span>Available units</span><strong>{number.format(metrics.unitsAvailable)}</strong><small>Ready for use</small></article>
      <article className={metrics.lowStock ? "is-alert" : ""}><span>Low stock alerts</span><strong>{number.format(metrics.lowStock)}</strong><small>{number.format(metrics.outOfStock)} out of stock</small></article>
      <article className={expiryAlerts.length ? "is-alert" : ""}><span>Expiry watch</span><strong>{number.format(expiryAlerts.length)}</strong><small>Lots due within 90 days</small></article>
    </div>
    <div className="inventory-dashboard-grid">
      <section className="inventory-card inventory-trend-card"><div className="inventory-card-heading"><div><h3>Stock movement</h3><p>Receipts into available stock and issues from it, by month.</p></div><span>Last 6 months</span></div>
        {trend.some(row => row.received || row.issued) ? <div className="inventory-chart" role="img" aria-label="Monthly stock receipts and issues bar chart">
          {trend.map(row => <div className="inventory-chart-month" key={row.month}>
            <div className="inventory-bars"><span className="inventory-bar received" style={{ height: `${row.received ? Math.max(4, row.received / maxMonthly * 100) : 0}%` }} title={`Received: ${number.format(row.received)}`} /><span className="inventory-bar issued" style={{ height: `${row.issued ? Math.max(4, row.issued / maxMonthly * 100) : 0}%` }} title={`Issued: ${number.format(row.issued)}`} /></div>
            <small>{new Date(`${row.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</small>
          </div>)}
        </div> : <p className="inventory-empty">No stock movements have been recorded in the last six months.</p>}
        <div className="inventory-legend"><span><i className="received" />Received</span><span><i className="issued" />Issued from available</span></div>
      </section>
      <section className="inventory-card"><div className="inventory-card-heading"><div><h3>Stock by status</h3><p>Units across all tracked items.</p></div></div>
        <div className="inventory-horizontal-chart" role="img" aria-label="Stock quantities by status bar chart">{stateTotals.map(row => <div className="inventory-horizontal-row" key={row.label}><span>{row.label}</span><div className="inventory-horizontal-track"><i className={row.color} style={{ width: `${row.quantity ? Math.max(2, row.quantity / maxState * 100) : 0}%` }} /></div><strong>{number.format(row.quantity)}</strong></div>)}</div>
      </section>
      <section className="inventory-card"><div className="inventory-card-heading"><div><h3>Available stock by location</h3><p>Top six locations, measured in tracked units.</p></div></div>
        {locationTotals.length ? <div className="inventory-horizontal-chart" role="img" aria-label="Available stock by location bar chart">{locationTotals.map(row => <div className="inventory-horizontal-row" key={row.name}><span title={row.name}>{row.name}</span><div className="inventory-horizontal-track"><i className="location" style={{ width: `${Math.max(2, row.quantity / maxLocation * 100)}%` }} /></div><strong>{number.format(row.quantity)}</strong></div>)}</div> : <p className="inventory-empty">No location balances have been recorded.</p>}
      </section>
      <section className="inventory-card"><div className="inventory-card-heading"><div><h3>Top items by available units</h3><p>Highest available quantities across the catalog.</p></div></div>
        {topItems.length ? <div className="inventory-horizontal-chart" role="img" aria-label="Top items by available quantity bar chart">{topItems.map(item => <div className="inventory-horizontal-row" key={item.id}><span title={`${item.sku} · ${item.name}`}>{item.name}</span><div className="inventory-horizontal-track"><i className="item" style={{ width: `${Math.max(2, item.states.AVAILABLE / maxItem * 100)}%` }} /></div><strong>{number.format(item.states.AVAILABLE)} {item.unit}</strong></div>)}</div> : <p className="inventory-empty">No available stock is recorded.</p>}
      </section>
      <section className="inventory-card"><div className="inventory-card-heading"><div><h3>Supply alerts</h3><p>Items at reorder level and lots approaching expiry.</p></div><a href="#inventory-actions">Open stock actions</a></div>
        <h4>Reorder attention</h4>{lowStock.length ? <ul className="inventory-alert-list">{lowStock.map(item => <li key={item.id}><span><strong>{item.name}</strong><small>{item.sku} · reorder at {number.format(item.reorderLevel)} {item.unit}</small></span><b>{number.format(item.states.AVAILABLE)} {item.unit}</b></li>)}</ul> : <p className="inventory-empty">No items are at or below their reorder level.</p>}
        <h4>Expiring lots</h4>{expiryAlerts.length ? <ul className="inventory-alert-list">{expiryAlerts.map(lot => <li key={lot.id}><span><strong>{lot.name}</strong><small>{lot.lotNumber} · {lot.locationName}</small></span><b>{new Date(`${lot.expiresOn}T00:00:00`).toLocaleDateString("en-GB")}</b></li>)}</ul> : <p className="inventory-empty">No tracked lots expire within 90 days.</p>}
      </section>
      <section className="inventory-card"><div className="inventory-card-heading"><div><h3>Recent stock activity</h3><p>Latest ledger entries across locations.</p></div></div>
        {movements.length ? <div className="inventory-activity-list">{movements.slice(0, 6).map(movement => <article key={movement.id}><span className={`inventory-activity-mark ${movement.fromState === "AVAILABLE" || movement.kind === "ISSUE" ? "out" : "in"}`}>{movement.fromState === "AVAILABLE" || movement.kind === "ISSUE" ? "−" : "+"}</span><div><strong>{movement.name}</strong><small>{movement.kind.replaceAll("_", " ")} · {movement.locationName || "Legacy location"} · {movement.actorEmail}</small></div><b>{movement.fromState === "AVAILABLE" || movement.kind === "ISSUE" ? "−" : "+"}{number.format(movement.quantity)} {movement.unit}</b></article>)}</div> : <p className="inventory-empty">No stock movements have been recorded.</p>}
      </section>
    </div>
    <div className="inventory-pie-grid">{pieCard("Stock mix by status", "Share of recorded units across stock states.", statePie)}{pieCard("Available stock by location", "Share of available units, including smaller locations.", locationPie)}</div>
    <p className="inventory-data-note">This dashboard shows tracked quantities and movements. Stock valuation and production work in progress are not currently recorded in the inventory data.</p>
  </section>;
}
