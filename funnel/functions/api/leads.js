/**
 * /api/leads — founder-gated pipeline data (backed by D1 env.DB).
 *
 *   GET                       → { ok, leads: [...] }  (all leads, newest first)
 *   POST   { name, phone, … } → create a contact entered by a founder (walk-in,
 *                               Messenger hand-off, neighbour intro — not the public form)
 *   PATCH  { id, stage }      → move a lead to a new stage
 *   PATCH  { id, notes }      → update a lead's notes
 *   PATCH  { id, name?, phone?, email?, … } → edit contact fields (phone required if sent)
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

/**
 * Read from a table this endpoint doesn't own.
 *
 * `documents` is created lazily by /api/documents and `install_projects` by
 * /api/install-ops, so on a database where neither has been touched yet the query is
 * "no such table" — which must read as "nothing linked", not as a failed delete. Any
 * other error still propagates.
 */
function tolerateMissingTable(err) {
  if (/no such table/i.test(String(err && err.message))) return null;
  throw err;
}

async function firstOrNull(env, sql, binds) {
  try {
    return await env.DB.prepare(sql).bind(...binds).first();
  } catch (err) {
    return tolerateMissingTable(err);
  }
}

async function allOrEmpty(env, sql, binds) {
  try {
    const r = await env.DB.prepare(sql).bind(...binds).all();
    return (r && r.results) || [];
  } catch (err) {
    tolerateMissingTable(err);
    return [];
  }
}

/** Same guard /api/documents uses before handing a key to R2. */
function isDocKey(value) {
  return typeof value === "string" && value.startsWith("docs/") && !value.includes("..") && value.length <= 300;
}

// The founder behind this request, or null. functions/api/_middleware.js already
// resolved (and logged) them; currentUser reuses that same lookup.
function requireFounder(context) {
  return currentUser(context);
}

/**
 * An unhandled throw here would return Pages' own HTML error page, and every caller in
 * leads.html parses the response as JSON — so a database error surfaced to the founder
 * as a bare "Network error" with nothing to act on. Always answer in JSON.
 */
export async function onRequest(context) {
  try {
    return await handle(context);
  } catch (err) {
    const detail = String((err && err.message) || err);
    console.error("api/leads failed:", detail);
    return json({ ok: false, error: `Server error: ${detail}` }, 500);
  }
}

async function handle(context) {
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

    const phone = textOrNull(body.phone, 40) || "";
    const digits = phone.replace(/[^\d]/g, "");
    if (digits.length < 10 || digits.length > 13) {
      return json({ ok: false, error: "A valid mobile number is required (10–13 digits)." }, 422);
    }

    // Name is optional on founder create — phone is the only hard requirement.
    // Schema is NOT NULL, so blank becomes "" rather than null.
    const name = textOrNull(body.name, 120) || "";

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

    // Contact card fields — phone stays the only hard requirement when it is sent.
    const FIELD_MAX = {
      name: 120, phone: 40, email: 120, goal: 120, address: 300,
      monthly_bill: 40, package: 60, current_solution: 200,
    };
    const touchingFields = Object.keys(FIELD_MAX).some((k) => k in body) || ("financing" in body);
    if (touchingFields) {
      const sets = [];
      const binds = [];
      for (const [field, max] of Object.entries(FIELD_MAX)) {
        if (!(field in body)) continue;
        let value = textOrNull(body[field], max);
        if (field === "phone") {
          const phone = value || "";
          const digits = phone.replace(/[^\d]/g, "");
          if (digits.length < 10 || digits.length > 13) {
            return json({ ok: false, error: "A valid mobile number is required (10–13 digits)." }, 422);
          }
          value = phone;
        } else if (field === "name" || field === "email" || field === "goal" ||
                   field === "address" || field === "monthly_bill" || field === "package" ||
                   field === "current_solution") {
          value = value || "";
        }
        sets.push(`${field} = ?`);
        binds.push(value);
      }
      if ("financing" in body) {
        sets.push("financing = ?");
        binds.push(body.financing === true || body.financing === 1 || body.financing === "yes" ? 1 : 0);
      }
      if (!sets.length) return json({ ok: false, error: "Nothing to update." }, 422);
      sets.push("updated_at = ?");
      binds.push(now, id);
      const r = await env.DB.prepare(
        `UPDATE leads SET ${sets.join(", ")} WHERE id = ?`
      ).bind(...binds).run();
      if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "Lead not found." }, 404);
      const lead = await env.DB.prepare(
        `SELECT id, name, phone, email, goal, address, monthly_bill, package, financing,
                current_solution, interview_opt_in, stage, notes,
                next_action, next_action_due, next_action_owner,
                source, utm_source, created_at, updated_at
         FROM leads WHERE id = ?`
      ).bind(id).first();
      return json({ ok: true, lead });
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

    const lead = await env.DB.prepare(`SELECT id, name FROM leads WHERE id = ?`).bind(id).first();
    if (!lead) return json({ ok: false, error: "Lead not found." }, 404);

    // An installation carries money, permits and a signed-off checklist, and
    // install_projects.lead_id is a real foreign key — cascading it away behind a
    // contact delete would both destroy that record and (before this check existed)
    // fail the DELETE with an unhandled FOREIGN KEY error. Refuse and name the job
    // so the founder unlinks it deliberately.
    const job = await firstOrNull(
      env,
      `SELECT id, job_code, customer_name FROM install_projects WHERE lead_id = ? LIMIT 1`,
      [id]
    );
    if (job) {
      const label = job.job_code || job.id;
      return json(
        {
          ok: false,
          error: `This contact is linked to install job ${label}. Open SC-07 and delete or unlink that job first.`,
          job_id: job.id,
          job_code: job.job_code || null,
        },
        409
      );
    }

    // Files attached to a contact live on the contact only (they are hidden from the
    // Documents library), so nobody could ever reach them again once the person is
    // gone. Delete the rows and their R2 objects instead of orphaning both.
    const files = await allOrEmpty(
      env,
      `SELECT id, file_key, thumb_key FROM documents WHERE lead_id = ?`,
      [id]
    );
    if (files.length) {
      await env.DB.prepare(`DELETE FROM documents WHERE lead_id = ?`).bind(id).run();
      for (const row of files) {
        for (const key of [row.file_key, row.thumb_key]) {
          if (env.NOTES_R2 && isDocKey(key)) {
            try { await env.NOTES_R2.delete(key); }
            catch { /* best effort — the row is already gone either way */ }
          }
        }
      }
    }

    // `quotes` rows are deliberately left in place: each one is the evidence that a
    // quotation actually left the building. leads.id is AUTOINCREMENT, so the stale
    // lead_id can never be reassigned to a different person.
    const r = await env.DB.prepare(`DELETE FROM leads WHERE id = ?`).bind(id).run();
    if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "Lead not found." }, 404);
    return json({ ok: true, files_deleted: files.length });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
