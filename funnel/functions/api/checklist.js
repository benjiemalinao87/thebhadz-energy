/**
 * /api/checklist — founder-gated shared checklists (backed by D1 env.DB).
 *
 *   GET  ?key=<checklist-key>        → { ok, state: {…}, updated_at }
 *   PUT  { key, state: {id: true} }  → upsert the whole checklist state
 *
 * State is a flat object of checkbox-id → boolean. The whole state is replaced
 * on each PUT (last write wins) — fine for a small founder team on one page.
 * Every method requires a valid founder session cookie (same auth as /internal).
 */
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

const KEY_RE = /^[a-z0-9-]{1,64}$/;
const MAX_ENTRIES = 300;

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

  if (request.method === "GET") {
    const key = new URL(request.url).searchParams.get("key") || "";
    if (!KEY_RE.test(key)) return json({ ok: false, error: "Invalid checklist key." }, 422);
    const row = await env.DB.prepare(
      `SELECT state_json, updated_at FROM checklists WHERE key = ?`
    ).bind(key).first();
    let state = {};
    try { state = row ? JSON.parse(row.state_json) : {}; } catch { state = {}; }
    return json({ ok: true, state, updated_at: row ? row.updated_at : null });
  }

  if (request.method === "PUT" || request.method === "POST") {
    let b;
    try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const key = String(b.key || "");
    if (!KEY_RE.test(key)) return json({ ok: false, error: "Invalid checklist key." }, 422);
    if (!b.state || typeof b.state !== "object" || Array.isArray(b.state)) {
      return json({ ok: false, error: "state must be an object of id → boolean." }, 422);
    }
    const entries = Object.entries(b.state);
    if (entries.length > MAX_ENTRIES) return json({ ok: false, error: "Too many entries." }, 422);
    const state = {};
    for (const [id, v] of entries) {
      if (typeof id !== "string" || id.length > 64) return json({ ok: false, error: "Invalid entry id." }, 422);
      if (v === true) state[id] = true; // only store checked items
    }
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO checklists (key, state_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`
    ).bind(key, JSON.stringify(state), now).run();
    return json({ ok: true, updated_at: now });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
