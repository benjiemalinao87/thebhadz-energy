/**
 * /api/leads — founder-gated pipeline data (backed by D1 env.DB).
 *
 *   GET                       → { ok, leads: [...] }  (all leads, newest first)
 *   PATCH  { id, stage }      → move a lead to a new stage
 *   PATCH  { id, notes }      → update a lead's notes
 *   DELETE { id }             → remove a lead
 *
 * Every method requires a valid founder session cookie (same auth as /internal).
 */
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

const STAGES = ["lead", "contacted", "demoed", "proposal", "sold", "lost"];

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
      `SELECT id, name, phone, email, goal, monthly_bill, package, financing,
              stage, notes, source, utm_source, created_at, updated_at
       FROM leads ORDER BY datetime(created_at) DESC`
    ).all();
    return json({ ok: true, leads: results || [] });
  }

  // ---- Update ----
  if (method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const id = parseInt(body.id, 10);
    if (!Number.isInteger(id)) return json({ ok: false, error: "A valid id is required." }, 422);
    const now = new Date().toISOString();

    if (typeof body.stage === "string") {
      if (!STAGES.includes(body.stage)) return json({ ok: false, error: "Unknown stage." }, 422);
      const r = await env.DB.prepare(
        `UPDATE leads SET stage = ?, updated_at = ? WHERE id = ?`
      ).bind(body.stage, now, id).run();
      if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "Lead not found." }, 404);
      return json({ ok: true });
    }

    if (typeof body.notes === "string") {
      const notes = body.notes.slice(0, 4000);
      const r = await env.DB.prepare(
        `UPDATE leads SET notes = ?, updated_at = ? WHERE id = ?`
      ).bind(notes, now, id).run();
      if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "Lead not found." }, 404);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Nothing to update (send stage or notes)." }, 422);
  }

  // ---- Delete ----
  if (method === "DELETE") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const id = parseInt(body.id, 10);
    if (!Number.isInteger(id)) return json({ ok: false, error: "A valid id is required." }, 422);
    const r = await env.DB.prepare(`DELETE FROM leads WHERE id = ?`).bind(id).run();
    if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "Lead not found." }, 404);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
