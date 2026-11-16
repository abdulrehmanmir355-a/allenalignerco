"use client";
import { useState } from "react";
import Link from "next/link";
import { commonQuestions, resourceItems } from "../lib/site-content";

export function Questions({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const items = (compact ? commonQuestions.slice(0, 4) : commonQuestions).filter(item => `${item.question} ${item.answer}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="question-list">
    {!compact && <label className="search-field">Search common questions<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Try uploads, verification or plan review" /></label>}
    {items.map(item => <details key={item.question}><summary>{item.question}<span aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}
    {!items.length && <p role="status" className="notice">No matching questions. Try a broader search or visit Contact and support.</p>}
  </div>;
}

export default function ResourceCenter() {
  const [category, setCategory] = useState("All guides"), [query, setQuery] = useState("");
  const categories = ["All guides", ...new Set(resourceItems.map(item => item.category))];
  const visible = resourceItems.filter(item => (category === "All guides" || item.category === category) && `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="resource-center"><label className="search-field">Find a guide<input type="search" placeholder="Search records, registration or plans…" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div className="filter-chips" aria-label="Resource categories">{categories.map(item => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
    <p className="resource-count" role="status">{visible.length} {visible.length === 1 ? "guide" : "guides"}</p>
    <div className="resource-grid">{visible.map(item => <Link className="resource-card" key={item.title} href={item.href}><span className="eyebrow">{item.category}</span><h3>{item.title}</h3><p>{item.description}</p><span className="resource-open">Open guide <span aria-hidden="true">↗</span></span></Link>)}</div>
    {!visible.length && <div className="empty-state"><h3>No guides match your search.</h3><button className="button secondary" onClick={() => { setQuery(""); setCategory("All guides"); }}>Clear filters</button></div>}
  </div>;
}
