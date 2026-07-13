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
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

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

async function requireFounder(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  return env.AUTH_SECRET ? verifyToken(token, env.AUTH_SECRET) : false;
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

  if (!(await requireFounder(request, env))) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }
  if (!env.DB) {
    return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);
  }

  const method = request.method;

  if (method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, title, owner, type, due, status, notes, created_at, updated_at
       FROM project_tasks
       ORDER BY
         CASE status
           WHEN 'This week' THEN 1
           WHEN 'Doing' THEN 2
           WHEN 'Blocked' THEN 3
           WHEN 'Backlog' THEN 4
           ELSE 5
         END,
         CASE WHEN due = '' OR due IS NULL THEN 1 ELSE 0 END,
         due ASC,
         datetime(created_at) DESC`
    ).all();
    return json({ ok: true, tasks: results || [] });
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
    const statements = [env.DB.prepare(`DELETE FROM project_tasks`)];
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
