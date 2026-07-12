/**
 * /api/notes — founder-gated team notes (backed by D1 env.DB; images in R2 env.NOTES_R2).
 *
 *   GET                                  → { ok, notes: [...] }  (newest first)
 *   POST   { author?, title?, body?, images? } → create a note
 *   PATCH  { id, title?, body?, images? }      → update a note
 *   DELETE { id }                        → remove a note + its R2 images
 *
 * `images` is an array of R2 object keys returned by /api/note-image (all "notes/…").
 * Every method requires a valid founder session cookie (same auth as /internal).
 */
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

const MAX_BODY = 8000;
const MAX_TITLE = 200;
const MAX_AUTHOR = 80;
const MAX_IMAGES = 12;

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

/** Validate the images field: an array of ≤ MAX_IMAGES keys, all under notes/. */
function cleanImages(images) {
  if (images === undefined) return undefined;
  if (!Array.isArray(images) || images.length > MAX_IMAGES) return null;
  for (const k of images) {
    if (typeof k !== "string" || !k.startsWith("notes/") || k.includes("..") || k.length > 300) return null;
  }
  return JSON.stringify(images);
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
    const images = cleanImages(b.images === undefined ? [] : b.images);
    if (images === null) return json({ ok: false, error: "Invalid images list." }, 422);
    if (!title && !body.trim() && images === "[]") {
      return json({ ok: false, error: "Note is empty — add a title, text, or an image." }, 422);
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
      const images = cleanImages(b.images);
      if (images === null) return json({ ok: false, error: "Invalid images list." }, 422);
      sets.push("images = ?"); binds.push(images);
    }
    if (!sets.length) return json({ ok: false, error: "Nothing to update (send title, body, or images)." }, 422);

    sets.push("updated_at = ?"); binds.push(new Date().toISOString());
    binds.push(id);
    const r = await env.DB.prepare(`UPDATE notes SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
    if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "Note not found." }, 404);
    return json({ ok: true });
  }

  // ---- Delete (note + its R2 images) ----
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
        try { await env.NOTES_R2.delete(keys.filter((k) => typeof k === "string" && k.startsWith("notes/"))); }
        catch { /* best effort — the note itself is already gone */ }
      }
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
