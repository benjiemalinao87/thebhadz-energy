/**
 * /api/leads — founder-gated pipeline data (backed by D1 env.DB).
 *
 *   GET                       → { ok, leads: [...] }  (all leads, newest first)
 *   POST   { name, phone, … } → create a contact entered by a founder (walk-in,
 *                               Messenger hand-off, neighbour intro — not the public form)
 *   PATCH  { id, stage }      → move a lead to a new stage
 *   PATCH  { id, notes }      → update a lead's notes
 *   PATCH  { id, next_action, next_action_due, next_action_owner }
 *                             → set/clear the one next step for this lead
 *   DELETE { id }             → remove a lead
 *
 * Every method requires a valid founder session cookie (same auth as /internal).
 */
import { currentUser } from "../_auth.js";

// "quote_sent" sits after demoed and before proposal: a quotation has gone out, but
// nothing has been negotiated yet. It is written by /api/quote, never by hand — the
// stage is only reached when an email actually left the building (Founder OS §1.4).
const STAGES = ["lead", "contacted", "demoed", "quote_sent", "proposal", "sold", "lost"];

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
    "ALTER TABLE leads ADD COLUMN address TEXT",
    "ALTER TABLE leads ADD COLUMN current_solution TEXT",
    "ALTER TABLE leads ADD COLUMN interview_opt_in INTEGER DEFAULT 0",
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
      `SELECT id, name, phone, email, goal, address, monthly_bill, package, financing,
              current_solution, interview_opt_in,
              stage, notes, next_action, next_action_due, next_action_owner,
              source, utm_source, created_at, updated_at
       FROM leads ORDER BY datetime(created_at) DESC`
    ).all();
    return json({ ok: true, leads: results || [] });
  }

  // ---- Create (founder-entered contact) ----
  if (method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }

    const name = textOrNull(body.name, 120);
    if (!name) return json({ ok: false, error: "A name is required." }, 422);

    const phone = textOrNull(body.phone, 40) || "";
    const digits = phone.replace(/[^\d]/g, "");
    if (digits.length < 10 || digits.length > 13) {
      return json({ ok: false, error: "A valid mobile number is required (10–13 digits)." }, 422);
    }

    const stage = typeof body.stage === "string" && STAGES.includes(body.stage) ? body.stage : "lead";
    const now = new Date().toISOString();
    const row = {
      name,
      phone,
      email: textOrNull(body.email, 120) || "",
      goal: textOrNull(body.goal, 120) || "",
      address: textOrNull(body.address, 300) || "",
      monthly_bill: textOrNull(body.monthly_bill, 40) || "",
      package: textOrNull(body.package, 60) || "",
      financing: body.financing === true || body.financing === 1 || body.financing === "yes" ? 1 : 0,
      current_solution: textOrNull(body.current_solution, 200) || "",
      interview_opt_in: 0,
      stage,
      notes: textOrNull(body.notes, 4000),
      source: textOrNull(body.source, 40) || "manual",
      created_at: now,
      updated_at: now,
    };

    try {
      const result = await env.DB.prepare(
        `INSERT INTO leads
          (name, phone, email, goal, address, monthly_bill, package, financing,
           current_solution, interview_opt_in, stage, notes,
           source, utm_source, utm_medium, utm_campaign, referrer, ip, country,
           created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?, ?, '','','','','','', ?,?)`
      ).bind(
        row.name, row.phone, row.email, row.goal, row.address,
        row.monthly_bill, row.package, row.financing,
        row.current_solution, row.interview_opt_in, row.stage, row.notes,
        row.source, row.created_at, row.updated_at
      ).run();

      const id = result && result.meta && result.meta.last_row_id;
      if (!id) return json({ ok: false, error: "Contact was saved but its id could not be read." }, 500);

      return json({
        ok: true,
        lead: {
          id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          goal: row.goal,
          address: row.address,
          monthly_bill: row.monthly_bill,
          package: row.package,
          financing: row.financing,
          current_solution: row.current_solution,
          interview_opt_in: row.interview_opt_in,
          stage: row.stage,
          notes: row.notes,
          next_action: null,
          next_action_due: null,
          next_action_owner: null,
          source: row.source,
          utm_source: null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
      });
    } catch (err) {
      return json({ ok: false, error: "Could not save the contact: " + String(err && err.message || err) }, 500);
    }
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
