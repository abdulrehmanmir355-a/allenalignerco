"use client";

import { useCallback, useEffect, useState } from "react";

type Status = "draft" | "review" | "published" | "archived";
type Article = {
  id: string; title: string; category: string; content: string; status: Status;
  version: number; created_by: string; updated_by: string; updated_at: string;
};
type Actor = { userId: string; role: string; canEdit: boolean; canPublish: boolean };
const categories = ["FAQs", "SOP Help", "Troubleshooting", "Training", "Approved Answers", "Internal How-To Guides"];
const emptyForm = { title: "", category: "FAQs", content: "" };
const field = { width: "100%", padding: "11px 12px", border: "1px solid #cbd5e1", borderRadius: 9, color: "#0f172a", background: "#fff" };
const button = { padding: "9px 13px", borderRadius: 8, border: "1px solid #94a3b8", background: "white", cursor: "pointer", color: "#0f172a", fontWeight: 600 as const };
function renderArticleContent(content: string) {
  return content.split(/(https:\/\/[^\s)]+)/g).map((part, index) =>
    index % 2 === 1
      ? <a key={index} href={part} target="_blank" rel="noreferrer noopener" style={{ color: "#087989", textDecoration: "underline", overflowWrap: "anywhere" }}>{part}</a>
      : part
  );
}

export default function KnowledgeArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [actor, setActor] = useState<Actor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Article | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/knowledge?" + new URLSearchParams({ q: query, category, status, page: String(page) }), { cache: "no-store", signal });
      const result = await response.json();
      if (signal?.aborted) return;
      if (!response.ok) throw new Error(result.error || "Unable to load articles.");
      setArticles(result.articles);
      setTotal(result.total);
      setPage(result.page);
      setActor(result.actor);
      setError("");
    } catch (e) { if (signal?.aborted) return; setArticles([]); setActor(null); setTotal(0); setError(e instanceof Error ? e.message : "Unable to load Knowledge Base."); }
  }, [query, category, status, page]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => { void load(controller.signal); }, 200); return () => { clearTimeout(timer); controller.abort(); }; }, [load]);

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/knowledge", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...form, id: editing.id, version: editing.version, action: "update" } : form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Save failed.");
      setForm(emptyForm); setEditing(null); setNotice(editing ? "Article updated and returned to Draft." : "Draft article saved.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed."); }
    finally { setBusy(false); }
  }

  async function act(article: Article, action: "submit" | "publish" | "archive" | "delete") {
    if (action === "delete" && !window.confirm(`Permanently delete “${article.title}”? This action is recorded in the audit log.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/knowledge", {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: article.id, version: article.version, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Action failed.");
      setNotice(`Article ${action === "submit" ? "submitted for review" : action === "publish" ? "published" : action === "archive" ? "archived" : "deleted"}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); }
    finally { setBusy(false); }
  }

  const filtered = articles;
  const headingStyle = { fontSize: 21, fontWeight: 700 as const, margin: "0 0 16px" };
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", minHeight: "100vh", background: "#f8fafc", padding: "30px 20px", color: "#0f172a" }}>
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap", marginBottom: 26 }}>
        <div><h1 style={{ fontSize: 31, fontWeight: 800, margin: 0 }}>{actor?.role === "DOCTOR" ? "Clinical Knowledge Base" : "Allen Aligner Knowledge Base"}</h1>
          <p style={{ color: "#64748b", marginTop: 6 }}>{actor?.role === "DOCTOR" ? "Professional reference articles reviewed for publication" : "Module 53 — Internal Articles, SOPs, FAQs and Approvals"}</p></div>
        <button style={button} onClick={() => void load()}>Refresh Articles</button>
      </div>
      {actor && <p style={{ color: "#64748b", fontSize: 13 }}>Signed in: {actor.role} · {actor.role === "DOCTOR" ? "Read-only access to published references" : actor.canPublish ? "Reviewer / Publisher" : "Contributor"}</p>}
      {actor?.role === "DOCTOR" && <p style={{ color: "#475569", background: "#eef6f7", borderRadius: 9, padding: 14, lineHeight: 1.6 }}>Clinical references support continuing professional education and do not replace patient-specific examination, diagnosis, informed consent, or clinical judgment. Follow current local requirements and the applicable device manufacturer’s instructions.</p>}
      {actor && actor.role !== "DOCTOR" && <p style={{ color: "#475569", background: "#eef6f7", borderRadius: 9, padding: 14, lineHeight: 1.6 }}>Only published articles appear in the clinician read-only Knowledge Base. New professional references stay in Draft until they are reviewed and approved by a separate authorized reviewer.</p>}
      {error && <p role="alert" style={{ color: "#b91c1c", border: "1px solid #fca5a5", borderRadius: 8, padding: 12 }}>{error}</p>}
      {notice && <p role="status" style={{ color: "#166534", padding: 12 }}>{notice}</p>}
      {actor?.canEdit && <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 22, marginTop: 16 }}>
        <h2 style={headingStyle}>{editing ? "Edit Article" : "Create New Article"}</h2>
        <form onSubmit={e => { e.preventDefault(); void save(); }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }} htmlFor="kb-title">Article Title</label>
          <input id="kb-title" required maxLength={180} style={field} value={form.title} onChange={e => setForm(x => ({ ...x, title: e.target.value }))} />
          <label style={{ display: "block", fontWeight: 600, margin: "15px 0 6px" }} htmlFor="kb-category">Category</label>
          <select id="kb-category" style={field} value={form.category} onChange={e => setForm(x => ({ ...x, category: e.target.value }))}>{categories.map(c => <option key={c}>{c}</option>)}</select>
          <label style={{ display: "block", fontWeight: 600, margin: "15px 0 6px" }} htmlFor="kb-content">Article Content</label>
          <textarea id="kb-content" required maxLength={50000} rows={7} style={{ ...field, resize: "vertical" }} value={form.content} onChange={e => setForm(x => ({ ...x, content: e.target.value }))} />
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button type="submit" disabled={busy || !actor?.canEdit} style={{ ...button, background: "#0f766e", color: "#fff", borderColor: "#0f766e" }}>{busy ? "Working..." : editing ? "Save Changes" : "Save Draft"}</button>
            {editing && <button type="button" style={button} onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel</button>}
          </div>
        </form>
      </section>}
      <section style={{ marginTop: 25 }}>
        <h2 style={headingStyle}>Knowledge Articles ({filtered.length})</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, marginBottom: 18 }}>
          <input aria-label="Search articles" placeholder="Search title or article..." style={field} value={query} maxLength={120} onChange={e => { setQuery(e.target.value); setPage(1); }} />
          <select aria-label="Filter by category" style={field} value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">All Categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
          {actor?.role !== "DOCTOR" && <select aria-label="Filter by status" style={field} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All Statuses</option>{["draft", "review", "published", "archived"].map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}</select>}
        </div>
        {filtered.length === 0 && <p>No matching articles.</p>}
        {filtered.map(a => {
          const isOwner = actor?.userId === a.created_by;
          const canModify = !!actor && actor.canEdit && (actor.canPublish || (isOwner && ["draft", "review"].includes(a.status)));
          return <article key={a.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 13, padding: 20, marginBottom: 13 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10 }}>
              <h3 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{a.title}</h3>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 15, background: "#e0f2fe" }}>{a.status.toUpperCase()}</span>
            </div>
            <p style={{ color: "#64748b", fontSize: 13 }}>{a.category} · Version {a.version} · Updated {new Date(a.updated_at).toLocaleString()}</p>
            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{renderArticleContent(a.content)}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginTop: 12 }}>
              {canModify && <button disabled={busy} style={button} onClick={() => { setEditing(a); setForm({ title: a.title, category: a.category, content: a.content }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>}
              {canModify && a.status === "draft" && <button disabled={busy} style={button} onClick={() => void act(a, "submit")}>Send for Review</button>}
              {actor?.canPublish && a.status === "review" && !isOwner && a.updated_by !== actor.userId && <button disabled={busy} style={button} onClick={() => void act(a, "publish")}>Approve & Publish</button>}
              {actor?.canPublish && a.status !== "archived" && <button disabled={busy} style={button} onClick={() => void act(a, "archive")}>Archive</button>}
              {actor?.canPublish && <button disabled={busy} style={{ ...button, color: "#b91c1c" }} onClick={() => void act(a, "delete")}>Delete</button>}
            </div>
          </article>;
        })}
        <nav aria-label="Article pages" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button style={button} disabled={busy || page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span>{total} articles · Page {page} of {Math.max(1, Math.ceil(total / 50))}</span>
          <button style={button} disabled={busy || page * 50 >= total} onClick={() => setPage(p => p + 1)}>Next</button>
        </nav>
      </section>
      <p style={{ color: "#64748b", fontSize: 12, marginTop: 25 }}>Articles are stored in PostgreSQL. Publication requires a separate authorized reviewer. Detailed changes are recorded in the database audit log.</p>
    </main>
  );
}
