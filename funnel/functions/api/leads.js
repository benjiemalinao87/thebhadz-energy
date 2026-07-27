/**
 * /api/leads — founder-gated pipeline data (backed by D1 env.DB).
 *
 *   GET                       → { ok, leads: [...] }  (all leads, newest first)
 *   PATCH  { id, stage }      → move a lead to a new stage
 *   PATCH  { id, notes }      → update a lead's notes
 *   PATCH  { id, next_action, next_action_due, next_action_owner }
 *                             → set/clear the one next step for this lead
 *   DELETE { id }             → remove a lead
 *
 * Every method requires a valid founder session cookie (same auth as /internal).
 */
import { currentUser } from "../_auth.js";

const STAGES = ["lead", "contacted", "demoed", "proposal", "sold", "lost"];

/**
 * Add the next-action columns to databases created before they existed.
 *
 * Mirrors the pattern in _auth.js: SQLite has no ADD COLUMN IF NOT EXISTS and a failing
 * statement aborts a batch, so each runs alone and "duplicate column" counts as success.
 * Cheap and idempotent — it means a deploy can't 500 because the schema file wasn't
 * applied by hand.
 */
let schemaChecked = false;
async function ensureNextActionColumns(env) {
  if (schemaChecked) return;
  const columns = [
    "ALTER TABLE leads ADD COLUMN next_action TEXT",
    "ALTER TABLE leads ADD COLUMN next_action_due TEXT",
    "ALTER TABLE leads ADD COLUMN next_action_owner TEXT",
  ];
  for (const sql of columns) {
    try {
      await env.DB.prepare(sql).run();
    } catch (err) {
      if (!/duplicate column/i.test(String(err && err.message))) throw err;
    }
  }
  schemaChecked = true;
}

/** Trim to a sane length, and treat blank as an explicit clear (null). */
function textOrNull(value, max) {
  if (value == null) return null;
  const s = String(value).trim().slice(0, max);
  return s === "" ? null : s;
}

/** Accept only YYYY-MM-DD; anything else clears the date rather than storing junk. */
function dateOrNull(value) {
  const s = textOrNull(value, 10);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

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

export async function onRequest(context) {
  const { request, env } = context;

  if (!(await requireFounder(context))) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }
  if (!env.DB) {
    return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);
  }

  const method = request.method;

  await ensureNextActionColumns(env);

  // ---- List ----
  if (method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, name, phone, email, goal, monthly_bill, package, financing,
              stage, notes, next_action, next_action_due, next_action_owner,
              source, utm_source, created_at, updated_at
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

    // The three next-action fields move together: sending any one of them rewrites the
    // whole next step, so clearing an action can never leave an orphaned due date
    // pointing at nothing.
    if ("next_action" in body || "next_action_due" in body || "next_action_owner" in body) {
      const action = textOrNull(body.next_action, 200);
      const due = action ? dateOrNull(body.next_action_due) : null;
      const owner = action ? textOrNull(body.next_action_owner, 80) : null;
      const r = await env.DB.prepare(
        `UPDATE leads SET next_action = ?, next_action_due = ?, next_action_owner = ?, updated_at = ?
         WHERE id = ?`
      ).bind(action, due, owner, now, id).run();
      if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "Lead not found." }, 404);
      return json({ ok: true, next_action: action, next_action_due: due, next_action_owner: owner });
    }

    return json({ ok: false, error: "Nothing to update (send stage, notes or next_action)." }, 422);
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
