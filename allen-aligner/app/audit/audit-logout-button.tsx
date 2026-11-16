'use client';
export default function AuditLogoutButton(){return <button className="button secondary" onClick={async()=>{await fetch('/api/audit/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});window.location.assign('/audit/login');}}>Sign out</button>;}
