/**
 * /api/notes — founder-gated team notes (backed by D1 env.DB; attachments in R2 env.NOTES_R2).
 *
 *   GET                                  → { ok, notes: [...] }  (newest first)
 *   POST   { author?, title?, body?, images? } → create a note
 *   PATCH  { id, title?, body?, images? }      → update a note
 *   DELETE { id }                              → remove a note + its R2 attachments
 *
 * The legacy `images` column now stores an attachment JSON array. Existing string
 * keys remain valid; new entries may be { key, name, type, size, kind } objects.
 * Every method requires a valid founder session cookie (same auth as /internal).
 */
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

const MAX_BODY = 8000;
const MAX_TITLE = 200;
const MAX_AUTHOR = 80;
const MAX_ATTACHMENTS = 12;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function requireFounder(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  return env.AUTH_SECRET ? verifyToken(token, env.AUTH_SECRET) : false;
}

function validKey(value) {
  return typeof value === "string" && value.startsWith("notes/") && !value.includes("..") && value.length <= 300;
}

/** Validate legacy image keys and new attachment metadata without trusting client paths. */
function cleanAttachments(attachments) {
  if (attachments === undefined) return undefined;
  if (!Array.isArray(attachments) || attachments.length > MAX_ATTACHMENTS) return null;
  const cleaned = [];
  for (const item of attachments) {
    if (typeof item === "string") {
      if (!validKey(item)) return null;
      cleaned.push(item);
      continue;
    }
    if (!item || typeof item !== "object" || !validKey(item.key)) return null;
    cleaned.push({
      key: item.key,
      name: String(item.name || "attachment").replace(/[\r\n]/g, "").slice(0, 200),
      type: String(item.type || "application/octet-stream").slice(0, 160),
      size: Math.max(0, Math.min(Number(item.size) || 0, 8 * 1024 * 1024)),
      kind: item.kind === "image" ? "image" : "document",
    });
  }
  return JSON.stringify(cleaned);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!(await requireFounder(request, env))) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }
  if (!env.DB) {
    return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);
  }

  const method = request.method;

  // ---- List ----
  if (method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, author, title, body, images, created_at, updated_at
       FROM notes ORDER BY datetime(created_at) DESC`
    ).all();
    return json({ ok: true, notes: results || [] });
  }

  // ---- Create ----
  if (method === "POST") {
    let b;
    try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const author = String(b.author || "").slice(0, MAX_AUTHOR).trim();
    const title = String(b.title || "").slice(0, MAX_TITLE).trim();
    const body = String(b.body || "").slice(0, MAX_BODY);
    const images = cleanAttachments(b.images === undefined ? [] : b.images);
    if (images === null) return json({ ok: false, error: "Invalid attachments list." }, 422);
    if (!title && !body.trim() && images === "[]") {
      return json({ ok: false, error: "Note is empty — add a title, text, image, or document." }, 422);
    }
    const now = new Date().toISOString();
    const r = await env.DB.prepare(
      `INSERT INTO notes (author, title, body, images, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(author, title, body, images, now, now).run();
    return json({
      ok: true,
      note: { id: r.meta.last_row_id, author, title, body, images, created_at: now, updated_at: now },
    });
  }

  // ---- Update ----
  if (method === "PATCH") {
    let b;
    try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const id = parseInt(b.id, 10);
    if (!Number.isInteger(id)) return json({ ok: false, error: "A valid id is required." }, 422);

    const sets = [];
    const binds = [];
    if (typeof b.title === "string") { sets.push("title = ?"); binds.push(b.title.slice(0, MAX_TITLE).trim()); }
    if (typeof b.body === "string") { sets.push("body = ?"); binds.push(b.body.slice(0, MAX_BODY)); }
    if (b.images !== undefined) {
      const images = cleanAttachments(b.images);
      if (images === null) return json({ ok: false, error: "Invalid attachments list." }, 422);
      sets.push("images = ?"); binds.push(images);
    }
    if (!sets.length) return json({ ok: false, error: "Nothing to update (send title, body, or attachments)." }, 422);

    sets.push("updated_at = ?"); binds.push(new Date().toISOString());
    binds.push(id);
    const r = await env.DB.prepare(`UPDATE notes SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
    if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "Note not found." }, 404);
    return json({ ok: true });
  }

  // ---- Delete (note + its R2 attachments) ----
  if (method === "DELETE") {
    let b;
    try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const id = parseInt(b.id, 10);
    if (!Number.isInteger(id)) return json({ ok: false, error: "A valid id is required." }, 422);

    const row = await env.DB.prepare(`SELECT images FROM notes WHERE id = ?`).bind(id).first();
    if (!row) return json({ ok: false, error: "Note not found." }, 404);

    await env.DB.prepare(`DELETE FROM notes WHERE id = ?`).bind(id).run();

    if (env.NOTES_R2) {
      let keys = [];
      try { keys = JSON.parse(row.images || "[]"); } catch { /* orphaned keys are harmless */ }
      if (Array.isArray(keys) && keys.length) {
        const attachmentKeys = keys.map((item) => typeof item === "string" ? item : item?.key).filter(validKey);
        try { if (attachmentKeys.length) await env.NOTES_R2.delete(attachmentKeys); }
        catch { /* best effort — the note itself is already gone */ }
      }
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
