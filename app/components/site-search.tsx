"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { searchDestinations } from "../lib/site-content";

export default function SiteSearch() {
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const results = searchDestinations.filter(item => `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  function show() { setQuery(""); dialog.current?.showModal(); input.current?.focus(); }
  function close() { dialog.current?.close(); trigger.current?.focus(); }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); if (dialog.current?.open) dialog.current.close(); else { dialog.current?.showModal(); input.current?.focus(); } } }
    document.addEventListener("keydown", shortcut); return () => document.removeEventListener("keydown", shortcut);
  }, []);
  return <div className="site-search-wrap"><button className="site-search-trigger" ref={trigger} onClick={show} aria-label="Search the website"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span>Search</span></button>
    <dialog className="search-dialog" ref={dialog} aria-labelledby="site-search-title" onClick={event => { if (event.target === dialog.current) close(); }}>
      <div className="search-dialog-inner"><div className="search-dialog-heading"><h2 id="site-search-title">Where would you like to go?</h2><button onClick={close} className="dialog-close" aria-label="Close search">×</button></div>
        <label className="search-field">Search pages and tools<input ref={input} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cases, uploads, registration…" /></label>
        <p className="fine-print">Navigation search only. Patient records are searched inside your private workspace.</p>
        <ul>{results.map(item => <li key={item.href}><Link href={item.href} onClick={() => dialog.current?.close()}><span><strong>{item.title}</strong><small>{item.description}</small></span><span aria-hidden="true">↗</span></Link></li>)}</ul>
        {!results.length && <p role="status">No matching pages. Try another search.</p>}
        <div className="search-dialog-footer"><span>Ctrl / ⌘ K to search</span><span>Esc to close</span></div>
      </div>
    </dialog></div>;
}
