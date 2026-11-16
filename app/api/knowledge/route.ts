import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sameOrigin } from "../../lib/portal-auth";
import { mayPublish } from "../../lib/knowledge-policy";
import { Pool, PoolClient } from "pg";
import { getKnowledgeActor, type KnowledgeActor } from "../../knowledge/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Status = "draft" | "review" | "published" | "archived";
type ArticleRow = {
  id: string; title: string; category: string; content: string; status: Status;
  version: number; created_by: string; updated_by: string;
  created_at: string; updated_at: string;
};
const categories = ["FAQs", "SOP Help", "Troubleshooting", "Training", "Approved Answers", "Internal How-To Guides"];
let pool: Pool | undefined;

function database(): Pool {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    throw new Error("PostgreSQL is not configured: DATABASE_URL or PGHOST is missing.");
  }
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    max: 5,
    connectionTimeoutMillis: 7000,
  });
  return pool;
}

const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const notAuthorized = () => reply({ error: "Please sign in to your authorized Allen internal account." }, 401);
const forbidden = () => reply({ error: "Your account is not authorized for this action." }, 403);
const dbError = (err: unknown) => {
  console.error("Allen Knowledge Base database error:", err);
  return reply({ error: "Knowledge Base database is unavailable. Check PostgreSQL configuration and privileges." }, 503);
};
function validUUID(id: unknown): id is string {
  return typeof id === "string" && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id);
}
function validateArticle(body: Record<string, unknown>): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Expected an article object.";
  if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 180) return "Title must contain 1–180 characters.";
  if (typeof body.content !== "string" || !body.content.trim() || body.content.length > 50000) return "Content must contain 1–50,000 characters.";
  if (typeof body.category !== "string" || !categories.includes(body.category)) return "Invalid category.";
  return null;
}
async function audit(client: PoolClient, id: string, actor: KnowledgeActor, action: string, before: ArticleRow | null, after: ArticleRow | null) {
  await client.query(
    "INSERT INTO allen_kb_audit(article_id,actor_id,action,before_data,after_data) VALUES ($1,$2,$3,$4,$5)",
    [id, actor.userId, action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]
  );
}

export async function GET(req: NextRequest) {
  const actor = await getKnowledgeActor();
  if (!actor) return notAuthorized();
  try {
    const term = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
    const category = req.nextUrl.searchParams.get("category") || "";
    const status = req.nextUrl.searchParams.get("status") || "";
    const rawPage = Number(req.nextUrl.searchParams.get("page") || 1);
    const requestedPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = 50;
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (actor.role === "DOCTOR") {
      conditions.push("status = 'published'");
    } else if (!actor.canPublish) {
      params.push(actor.userId);
      conditions.push(`(status = 'published' OR created_by = $${params.length})`);
    }
    if (term) { params.push("%" + term.replace(/[\\%_]/g, "\\$&") + "%"); conditions.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length})`); }
    if (category && categories.includes(category)) { params.push(category); conditions.push(`category = $${params.length}`); }
    if (["draft", "review", "published", "archived"].includes(status)) { params.push(status); conditions.push(`status = $${params.length}`); }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const count = await database().query(`SELECT count(*)::int AS total FROM allen_kb_articles ${where}`, params);
    const total = Number(count.rows[0].total);
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    const result = await database().query(`SELECT * FROM allen_kb_articles ${where} ORDER BY updated_at DESC,id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params,pageSize,(page-1)*pageSize]);
    return reply({ articles: result.rows, actor, total, page, pageSize });
  } catch (err) { return dbError(err); }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return reply({ error: "Invalid request origin." }, 403);
  const actor = await getKnowledgeActor();
  if (!actor) return notAuthorized();
  if (!actor.canEdit) return forbidden();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON." }, 400); }
  const error = validateArticle(body);
  if (error) return reply({ error }, 400);
  const id = randomUUID();
  try {
    const client = await database().connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ArticleRow>(
        "INSERT INTO allen_kb_articles(id,title,category,content,status,created_by,updated_by) VALUES ($1,$2,$3,$4,'draft',$5,$5) RETURNING *",
        [id, String(body.title).trim(), body.category, String(body.content).trim(), actor.userId]
      );
      await audit(client, id, actor, "create", null, result.rows[0]);
      await client.query("COMMIT");
      return reply({ article: result.rows[0] }, 201);
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  } catch (err) { return dbError(err); }
}

export async function PATCH(req: NextRequest) {
  if (!sameOrigin(req)) return reply({ error: "Invalid request origin." }, 403);
  const actor = await getKnowledgeActor();
  if (!actor) return notAuthorized();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Expected an article object." }, 400);
  if (!validUUID(body.id)) return reply({ error: "Invalid article ID." }, 400);
  if (!actor.canEdit) return forbidden();
  const action = body.action;
  if (!["update", "submit", "publish", "archive"].includes(String(action))) return reply({ error: "Unknown action." }, 400);
  if ((action === "publish" || action === "archive") && !actor.canPublish) return forbidden();
  if (action === "update") { const error = validateArticle(body); if (error) return reply({ error }, 400); }
  try {
    const client = await database().connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<ArticleRow>("SELECT * FROM allen_kb_articles WHERE id=$1 FOR UPDATE", [body.id]);
      const old = found.rows[0];
      if (!old) { await client.query("ROLLBACK"); return reply({ error: "Article not found." }, 404); }
      if (!actor.canPublish && old.created_by !== actor.userId) { await client.query("ROLLBACK"); return forbidden(); }
      if (typeof body.version !== "number" || body.version !== old.version) { await client.query("ROLLBACK"); return reply({ error: "Article changed in another session. Refresh and retry." }, 409); }
      let title = old.title, category = old.category, content = old.content, status: Status = old.status;
      if (action === "update") {
        if (!actor.canPublish && !["draft", "review"].includes(status)) { await client.query("ROLLBACK"); return forbidden(); }
        title = String(body.title).trim(); category = String(body.category); content = String(body.content).trim();
        status = "draft"; // Any edited published article must be reviewed again.
      }
      if (action === "submit") {
        if (status !== "draft") { await client.query("ROLLBACK"); return reply({ error: "Only drafts may be submitted for review." }, 400); }
        status = "review";
      }
      if (action === "publish") {
        if (status !== "review") { await client.query("ROLLBACK"); return reply({ error: "Only reviewed articles may be published." }, 400); }
        if (!mayPublish(actor, old)) { await client.query("ROLLBACK"); return reply({ error: "A reviewer who did not create or last edit this article must publish it." }, 403); }
        status = "published";
      }
      if (action === "archive") status = "archived";
      const updated = await client.query<ArticleRow>(
        "UPDATE allen_kb_articles SET title=$2,category=$3,content=$4,status=$5,version=version+1,updated_by=$6,updated_at=now() WHERE id=$1 RETURNING *",
        [body.id, title, category, content, status, actor.userId]
      );
      await audit(client, old.id, actor, String(action), old, updated.rows[0]);
      await client.query("COMMIT");
      return reply({ article: updated.rows[0] });
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  } catch (err) { return dbError(err); }
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return reply({ error: "Invalid request origin." }, 403);
  const actor = await getKnowledgeActor();
  if (!actor) return notAuthorized();
  if (!actor.canPublish) return forbidden();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Expected an article object." }, 400);
  if (!validUUID(body.id)) return reply({ error: "Invalid article ID." }, 400);
  try {
    const client = await database().connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<ArticleRow>("SELECT * FROM allen_kb_articles WHERE id=$1 FOR UPDATE", [body.id]);
      const old = found.rows[0];
      if (!old) { await client.query("ROLLBACK"); return reply({ error: "Article not found." }, 404); }
      if (typeof body.version !== "number" || body.version !== old.version) { await client.query("ROLLBACK"); return reply({ error: "Article changed in another session. Refresh and retry." }, 409); }
      await audit(client, old.id, actor, "delete", old, null);
      await client.query("DELETE FROM allen_kb_articles WHERE id=$1", [body.id]);
      await client.query("COMMIT");
      return reply({ ok: true });
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  } catch (err) { return dbError(err); }
}
