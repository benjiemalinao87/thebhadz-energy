/**
 * /api/founder-lab — shared founder strategy state backed by D1.
 *
 * GET -> { ok, state, updated_at }
 * PUT { state } -> replace the shared state document
 */
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

const DOCUMENT_ID = "founder-strategy-v1";
const MAX_STATE_BYTES = 64 * 1024;

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
    const row = await env.DB.prepare(
      "SELECT state_json, updated_at FROM founder_strategy WHERE id = ?"
    ).bind(DOCUMENT_ID).first();
    if (!row) return json({ ok: true, state: null, updated_at: null });
    try {
      return json({ ok: true, state: JSON.parse(row.state_json), updated_at: row.updated_at });
    } catch {
      return json({ ok: false, error: "Saved founder strategy is invalid JSON." }, 500);
    }
  }

  if (request.method === "PUT") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON." }, 400);
    }
    if (!body || typeof body.state !== "object" || Array.isArray(body.state)) {
      return json({ ok: false, error: "Expected a state object." }, 422);
    }
    const stateJson = JSON.stringify(body.state);
    if (new TextEncoder().encode(stateJson).byteLength > MAX_STATE_BYTES) {
      return json({ ok: false, error: "Strategy state is too large." }, 413);
    }
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO founder_strategy (id, state_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`
    ).bind(DOCUMENT_ID, stateJson, now).run();
    return json({ ok: true, updated_at: now });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
