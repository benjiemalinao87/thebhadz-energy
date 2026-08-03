/**
 * /api/projects — founder-gated project board tasks backed by D1 env.DB.
 *
 *   GET                         -> { ok, tasks: [...] }
 *   POST   { title, owner?, type?, due?, status?, notes? } -> create a task
 *   PATCH  { id, ...fields }    -> update a task
 *   PUT    { tasks: [...] }     -> replace board from an export
 *   DELETE { id }               -> remove a task
 *
 * Every method requires a valid founder session cookie (same auth as /internal).
 */
import { currentUser } from "../_auth.js";

const TYPES = ["Traction", "Product", "Ops"];
const STATUSES = ["Backlog", "This week", "Doing", "Blocked", "Done"];
const MAX_TITLE = 96;
const MAX_OWNER = 36;
const MAX_NOTES = 160;

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

/**
 * Whether project_tasks.job_id exists yet. /api/jobs adds it on first use, so a database
 * that has not met that code path is a real state this endpoint has to survive: without
 * the column there are no job tasks to exclude, and the board is correct unfiltered.
 *
 * Probed once per isolate — the schema cannot change under a running isolate — and only
 * a definite answer is cached, so a transient failure re-probes on the next request.
 */
let hasJobColumn = null;
async function jobColumnExists(env) {
  if (hasJobColumn === null) {
    try {
      await env.DB.prepare(`SELECT job_id FROM project_tasks LIMIT 1`).all();
      hasJobColumn = true;
    } catch (err) {
      // "no such column" is the expected pre-migration answer. Anything else (a genuine
      // outage) must not be remembered as "no column" for the life of the isolate.
      if (!/no such column/i.test(String(err && err.message))) throw err;
      hasJobColumn = false;
    }
  }
  return hasJobColumn;
}

/**
 * Company work only. Tasks with a job_id are one installation's checklist and belong to
 * /api/jobs — listing them here would put ~30 rows per job on the Founder OS board and
 * let the 50%-traction gauge read near-100% while nobody is selling.
 */
async function companyTasks(env, columns, order) {
  const scope = (await jobColumnExists(env)) ? `WHERE job_id IS NULL` : ``;
  const { results } = await env.DB.prepare(`SELECT ${columns} FROM project_tasks ${scope} ${order}`).all();
  return results || [];
}

function cleanDate(value) {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function cleanTask(input, existingId) {
  const title = String(input.title || "").trim().slice(0, MAX_TITLE);
  if (!title) return null;
  const type = TYPES.includes(input.type) ? input.type : "Traction";
  const status = STATUSES.includes(input.status) ? input.status : "Backlog";
  return {
    id: String(existingId || input.id || crypto.randomUUID()).slice(0, 80),
    title,
    owner: String(input.owner || "").trim().slice(0, MAX_OWNER),
    type,
    due: cleanDate(input.due),
    status,
    notes: String(input.notes || "").trim().slice(0, MAX_NOTES),
  };
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

  if (method === "GET") {
    const order = `ORDER BY
         CASE status
           WHEN 'This week' THEN 1
           WHEN 'Doing' THEN 2
           WHEN 'Blocked' THEN 3
           WHEN 'Backlog' THEN 4
           ELSE 5
         END,
         CASE WHEN due = '' OR due IS NULL THEN 1 ELSE 0 END,
         due ASC,
         datetime(created_at) DESC`;
    const columns = `id, title, owner, type, due, status, notes, created_at, updated_at`;
    const results = await companyTasks(env, columns, order);
    return json({ ok: true, tasks: results });
  }

  if (method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const task = cleanTask(body);
    if (!task) return json({ ok: false, error: "Task title is required." }, 422);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO project_tasks (id, title, owner, type, due, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(task.id, task.title, task.owner, task.type, task.due, task.status, task.notes, now, now).run();
    return json({ ok: true, task: { ...task, created_at: now, updated_at: now } });
  }

  if (method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const id = String(body.id || "").trim();
    if (!id) return json({ ok: false, error: "A valid id is required." }, 422);

    const sets = [];
    const binds = [];
    if (typeof body.title === "string") {
      const title = body.title.trim().slice(0, MAX_TITLE);
      if (!title) return json({ ok: false, error: "Task title is required." }, 422);
      sets.push("title = ?"); binds.push(title);
    }
    if (typeof body.owner === "string") { sets.push("owner = ?"); binds.push(body.owner.trim().slice(0, MAX_OWNER)); }
    if (typeof body.type === "string") {
      if (!TYPES.includes(body.type)) return json({ ok: false, error: "Unknown task type." }, 422);
      sets.push("type = ?"); binds.push(body.type);
    }
    if (typeof body.due === "string") { sets.push("due = ?"); binds.push(cleanDate(body.due)); }
    if (typeof body.status === "string") {
      if (!STATUSES.includes(body.status)) return json({ ok: false, error: "Unknown task status." }, 422);
      sets.push("status = ?"); binds.push(body.status);
    }
    if (typeof body.notes === "string") { sets.push("notes = ?"); binds.push(body.notes.trim().slice(0, MAX_NOTES)); }
    if (!sets.length) return json({ ok: false, error: "Nothing to update." }, 422);

    sets.push("updated_at = ?"); binds.push(new Date().toISOString());
    binds.push(id);
    const result = await env.DB.prepare(`UPDATE project_tasks SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
    if (!result.meta || result.meta.changes === 0) return json({ ok: false, error: "Task not found." }, 404);
    return json({ ok: true });
  }

  if (method === "PUT") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    if (!Array.isArray(body.tasks)) return json({ ok: false, error: "Expected tasks array." }, 422);
    const now = new Date().toISOString();
    const tasks = body.tasks.map((task) => cleanTask(task)).filter(Boolean).slice(0, 200);
    // Job checklists share this table and are NOT part of a company-board export, so the
    // replace is scoped. Unscoped, importing a board would delete every job's tasks.
    const statements = [
      (await jobColumnExists(env))
        ? env.DB.prepare(`DELETE FROM project_tasks WHERE job_id IS NULL`)
        : env.DB.prepare(`DELETE FROM project_tasks`),
    ];
    for (const task of tasks) {
      statements.push(env.DB.prepare(
        `INSERT INTO project_tasks (id, title, owner, type, due, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(task.id, task.title, task.owner, task.type, task.due, task.status, task.notes, task.created_at || now, now));
    }
    await env.DB.batch(statements);
    return json({ ok: true, count: tasks.length });
  }

  if (method === "DELETE") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const id = String(body.id || "").trim();
    if (!id) return json({ ok: false, error: "A valid id is required." }, 422);
    const result = await env.DB.prepare(`DELETE FROM project_tasks WHERE id = ?`).bind(id).run();
    if (!result.meta || result.meta.changes === 0) return json({ ok: false, error: "Task not found." }, 404);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
