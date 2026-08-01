/**
 * /api/documents — founder-gated document library (backed by D1 env.DB; uploaded
 * file bytes live in R2 env.NOTES_R2 under docs/, via /api/document-file).
 *
 *   GET                                    → { ok, documents: [...] }  (no body_html, newest first)
 *   GET    ?id=N                           → { ok, document }          (full row incl. body_html)
 *   POST   { title, body_html }            → create a rich-text doc (kind='doc')
 *   POST   { title?, file: {key,name,type,size,thumbKey?} } → register an uploaded file (kind='file')
 *   PATCH  { id, title?, body_html? }      → update (body_html only for kind='doc')
 *   DELETE { id }                          → remove a document + its R2 file/thumbnail if any
 *
 * thumb_key points at the small preview /api/document-file stored next to an image
 * upload (docs/….thumb.jpg) — the library list renders it instead of the generic icon.
 *
 * body_html is sanitized server-side with HTMLRewriter against a small allowlist
 * (headings, paragraphs, bold/italic/underline, lists, links) — whatever the editor
 * or a crafted request sends, only that subset is ever stored or served back.
 * Every method requires a valid founder session cookie (same auth as /internal).
 */
import { currentUser } from "../_auth.js";

const MAX_TITLE = 200;
const MAX_BODY_HTML = 400 * 1024; // 400 KB of markup is a very long doc
const MAX_FILE_BYTES = 25 * 1024 * 1024; // must match /api/document-file

/**
 * Filing categories, in the order the chips appear. Adding one is a change here
 * plus the matching CATEGORIES list in internal/docs.html — the column is plain
 * TEXT precisely so a new category needs no migration. `general` is the default
 * and the fallback for any value this list doesn't recognise.
 */
export const CATEGORIES = ["general", "pricing", "sops", "legal", "suppliers", "marketing", "meetings"];
const DEFAULT_CATEGORY = "general";

function cleanCategory(value) {
  const key = String(value || "").trim().toLowerCase();
  return CATEGORIES.indexOf(key) !== -1 ? key : DEFAULT_CATEGORY;
}

// Tags the editor can produce (plus harmless equivalents pasted content may carry).
// Anything else is unwrapped; containers that hide payloads are dropped entirely.
const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr", "div", "span",
  "b", "strong", "i", "em", "u", "s",
  "ul", "ol", "li", "blockquote", "pre", "code", "a",
]);
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "form", "input", "button",
  "textarea", "select", "meta", "link", "base", "svg", "math", "template", "noscript",
]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// The founder behind this request, or null. functions/api/_middleware.js already
// resolved (and logged) them; currentUser reuses that same lookup.
function requireFounder(context) {
  return currentUser(context);
}

// Created on demand for the same reason as the auth tables (_auth.js): a deploy
// that beats the schema.sql apply must degrade to "empty library", never a 500.
//
// Memoized per isolate: CREATE TABLE IF NOT EXISTS + ALTER TABLE are two D1 round
// trips, and paying them on every list/create/patch made the page feel slow for no
// benefit — the schema cannot change under a running isolate. A failure is NOT
// cached, so a transient error just retries on the next request.
let schemaReady = null;
function ensureTable(env) {
  if (!schemaReady) {
    schemaReady = migrate(env).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function migrate(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS documents (
       id          INTEGER PRIMARY KEY AUTOINCREMENT,
       kind        TEXT NOT NULL DEFAULT 'doc' CHECK (kind IN ('doc', 'file')),
       title       TEXT NOT NULL,
       body_html   TEXT NOT NULL DEFAULT '',
       file_key    TEXT,
       file_name   TEXT,
       file_type   TEXT,
       file_size   INTEGER NOT NULL DEFAULT 0,
       category    TEXT NOT NULL DEFAULT 'general',
       author      TEXT NOT NULL DEFAULT '',
       updated_by  TEXT NOT NULL DEFAULT '',
       created_at  TEXT NOT NULL,
       updated_at  TEXT NOT NULL
     )`
  ).run();
  // Tables created before categories existed need the column added. ALTER TABLE
  // has no IF NOT EXISTS in SQLite, so a duplicate-column error is the success
  // case on every run after the first.
  try {
    await env.DB.prepare(`ALTER TABLE documents ADD COLUMN category TEXT NOT NULL DEFAULT 'general'`).run();
  } catch { /* already present */ }
  try {
    await env.DB.prepare(`ALTER TABLE documents ADD COLUMN thumb_key TEXT`).run();
  } catch { /* already present */ }
}

/** Allowlist sanitizer. Runs on every write, so stored HTML is safe to render as-is. */
async function sanitizeHtml(html) {
  const rewriter = new HTMLRewriter().on("*", {
    element(el) {
      const tag = el.tagName.toLowerCase();
      if (DROP_WITH_CONTENT.has(tag)) { el.remove(); return; }
      if (!ALLOWED_TAGS.has(tag)) { el.removeAndKeepContent(); return; }
      const names = [];
      for (const [name] of el.attributes) names.push(name);
      for (const name of names) {
        if (!(tag === "a" && name.toLowerCase() === "href")) el.removeAttribute(name);
      }
      if (tag === "a") {
        const href = (el.getAttribute("href") || "").trim();
        if (/^(https?:|mailto:)/i.test(href)) {
          el.setAttribute("rel", "noopener noreferrer");
          el.setAttribute("target", "_blank");
        } else {
          el.removeAttribute("href");
        }
      }
    },
    comments(comment) { comment.remove(); },
  });
  const res = rewriter.transform(
    new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
  );
  return await res.text();
}

function validFileKey(value) {
  return typeof value === "string" && value.startsWith("docs/") && !value.includes("..") && value.length <= 300;
}

/** Validate upload metadata from /api/document-file without trusting client paths. */
function cleanFile(file) {
  if (!file || typeof file !== "object" || !validFileKey(file.key)) return null;
  return {
    key: file.key,
    name: String(file.name || "document").replace(/[\r\n]/g, "").slice(0, 200) || "document",
    type: String(file.type || "application/octet-stream").slice(0, 160),
    size: Math.max(0, Math.min(Number(file.size) || 0, MAX_FILE_BYTES)),
    thumbKey: validFileKey(file.thumbKey) ? file.thumbKey : null,
  };
}

const LIST_COLUMNS =
  "id, kind, title, file_key, file_name, file_type, file_size, thumb_key, category, author, updated_by, created_at, updated_at";

export async function onRequest(context) {
  const { request, env } = context;

  const founder = await requireFounder(context);
  if (!founder) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }
  if (!env.DB) {
    return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);
  }
  await ensureTable(env);

  const method = request.method;

  // ---- List / read one ----
  if (method === "GET") {
    const idParam = new URL(request.url).searchParams.get("id");
    if (idParam !== null) {
      const id = parseInt(idParam, 10);
      if (!Number.isInteger(id)) return json({ ok: false, error: "A valid id is required." }, 422);
      const row = await env.DB.prepare(`SELECT * FROM documents WHERE id = ?`).bind(id).first();
      if (!row) return json({ ok: false, error: "Document not found." }, 404);
      return json({ ok: true, document: row });
    }
    const { results } = await env.DB.prepare(
      `SELECT ${LIST_COLUMNS} FROM documents ORDER BY datetime(updated_at) DESC`
    ).all();
    return json({ ok: true, documents: results || [], categories: CATEGORIES });
  }

  // ---- Create ----
  if (method === "POST") {
    let b;
    try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const author = String(founder.name || "").slice(0, 80).trim();
    const category = cleanCategory(b.category);
    const now = new Date().toISOString();

    // Uploaded file → one library row pointing at the R2 object.
    if (b.file !== undefined) {
      const file = cleanFile(b.file);
      if (!file) return json({ ok: false, error: "Invalid file metadata — upload via /api/document-file first." }, 422);
      const title = String(b.title || file.name).slice(0, MAX_TITLE).trim() || file.name;
      const r = await env.DB.prepare(
        `INSERT INTO documents (kind, title, body_html, file_key, file_name, file_type, file_size, thumb_key, category, author, updated_by, created_at, updated_at)
         VALUES ('file', ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(title, file.key, file.name, file.type, file.size, file.thumbKey, category, author, author, now, now).run();
      return json({
        ok: true,
        document: {
          id: r.meta.last_row_id, kind: "file", title, category,
          file_key: file.key, file_name: file.name, file_type: file.type, file_size: file.size, thumb_key: file.thumbKey,
          author, updated_by: author, created_at: now, updated_at: now,
        },
      });
    }

    // Rich-text doc written in the editor.
    const title = String(b.title || "").slice(0, MAX_TITLE).trim();
    if (!title) return json({ ok: false, error: "A title is required." }, 422);
    const rawBody = String(b.body_html || "");
    if (rawBody.length > MAX_BODY_HTML) return json({ ok: false, error: "Document is too long." }, 413);
    const bodyHtml = await sanitizeHtml(rawBody);
    const r = await env.DB.prepare(
      `INSERT INTO documents (kind, title, body_html, category, author, updated_by, created_at, updated_at)
       VALUES ('doc', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(title, bodyHtml, category, author, author, now, now).run();
    return json({
      ok: true,
      document: {
        id: r.meta.last_row_id, kind: "doc", title, body_html: bodyHtml, category,
        file_key: null, file_name: null, file_type: null, file_size: 0, thumb_key: null,
        author, updated_by: author, created_at: now, updated_at: now,
      },
    });
  }

  // ---- Update ----
  if (method === "PATCH") {
    let b;
    try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const id = parseInt(b.id, 10);
    if (!Number.isInteger(id)) return json({ ok: false, error: "A valid id is required." }, 422);

    const row = await env.DB.prepare(`SELECT id, kind FROM documents WHERE id = ?`).bind(id).first();
    if (!row) return json({ ok: false, error: "Document not found." }, 404);

    const sets = [];
    const binds = [];
    if (typeof b.title === "string") {
      const title = b.title.slice(0, MAX_TITLE).trim();
      if (!title) return json({ ok: false, error: "The title cannot be empty." }, 422);
      sets.push("title = ?"); binds.push(title);
    }
    if (typeof b.body_html === "string") {
      if (row.kind !== "doc") return json({ ok: false, error: "Uploaded files have no editable body." }, 422);
      if (b.body_html.length > MAX_BODY_HTML) return json({ ok: false, error: "Document is too long." }, 413);
      sets.push("body_html = ?"); binds.push(await sanitizeHtml(b.body_html));
    }
    if (b.category !== undefined) {
      sets.push("category = ?"); binds.push(cleanCategory(b.category));
    }
    if (!sets.length) return json({ ok: false, error: "Nothing to update (send title, body_html, or category)." }, 422);

    sets.push("updated_by = ?"); binds.push(String(founder.name || "").slice(0, 80).trim());
    sets.push("updated_at = ?"); binds.push(new Date().toISOString());
    binds.push(id);
    await env.DB.prepare(`UPDATE documents SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
    const updated = await env.DB.prepare(`SELECT * FROM documents WHERE id = ?`).bind(id).first();
    return json({ ok: true, document: updated });
  }

  // ---- Delete (row + its R2 file) ----
  if (method === "DELETE") {
    let b;
    try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const id = parseInt(b.id, 10);
    if (!Number.isInteger(id)) return json({ ok: false, error: "A valid id is required." }, 422);

    const row = await env.DB.prepare(`SELECT file_key, thumb_key FROM documents WHERE id = ?`).bind(id).first();
    if (!row) return json({ ok: false, error: "Document not found." }, 404);

    await env.DB.prepare(`DELETE FROM documents WHERE id = ?`).bind(id).run();

    for (const key of [row.file_key, row.thumb_key]) {
      if (env.NOTES_R2 && validFileKey(key)) {
        try { await env.NOTES_R2.delete(key); }
        catch { /* best effort — the row itself is already gone */ }
      }
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
