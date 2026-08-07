/**
 * /api/goals — founder-gated countable goals (leads, deposits, surveys, sold, manual).
 *
 *   GET                              -> { ok, goals: [...enriched], people: [...] }
 *   GET  ?notes_for=<goal_id>        -> { ok, notes: [...] }  (line-item comments)
 *   POST   { title, metric?, … }     -> create goal (owner from session)
 *   POST   { resource: "note", goal_id, body, category? }
 *   PATCH  { id, …fields }           -> update goal (owner stays the creator)
 *   PATCH  { resource: "note", id, body?, category? }
 *   DELETE { id }                    -> remove goal (+ its notes)
 *   DELETE { resource: "note", id }  -> remove one note
 *
 * Progress for non-manual metrics is computed live from D1 — never stored as truth.
 * Owner always comes from the session on create. Note author always from session.
 */
import { currentUser } from "../_auth.js";
import { phToday } from "../_ph-date.js";

const METRICS = ["leads", "deposits", "surveys", "sold", "manual"];
const STATUSES = ["Backlog", "This week", "Doing", "Done", "Missed"];
const NOTE_CATEGORIES = ["general", "progress", "blocker", "decision", "win"];
const MAX_TITLE = 120;
const MAX_NOTES = 400;
const MAX_NOTE_BODY = 2000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function text(value, max) {
  return String(value || "").trim().slice(0, max);
}

function date(value) {
  const d = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

function int(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = migrate(env).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function migrate(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS goals (
       id               TEXT PRIMARY KEY,
       title            TEXT NOT NULL,
       metric           TEXT NOT NULL DEFAULT 'manual',
       target           INTEGER NOT NULL DEFAULT 1,
       current_manual   INTEGER NOT NULL DEFAULT 0,
       start_date       TEXT NOT NULL,
       end_date         TEXT NOT NULL,
       status           TEXT NOT NULL DEFAULT 'Backlog',
       owner_user_id    INTEGER,
       owner_name       TEXT NOT NULL DEFAULT '',
       assignee_user_id INTEGER,
       assignee_name    TEXT NOT NULL DEFAULT '',
       notes            TEXT NOT NULL DEFAULT '',
       created_at       TEXT NOT NULL,
       updated_at       TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_goals_end ON goals(end_date)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status)`).run();
  // Line-item comments on a goal (not the legacy single goals.notes blob).
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS goal_notes (
       id               TEXT PRIMARY KEY,
       goal_id          TEXT NOT NULL,
       body             TEXT NOT NULL,
       category         TEXT NOT NULL DEFAULT 'general',
       author_user_id   INTEGER,
       author_name      TEXT NOT NULL DEFAULT '',
       created_at       TEXT NOT NULL,
       updated_at       TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_goal_notes_goal ON goal_notes(goal_id, datetime(created_at) DESC)`
  ).run();
}

function noteCategory(value) {
  const c = text(value, 40).toLowerCase();
  return NOTE_CATEGORIES.includes(c) ? c : "general";
}

async function listNotes(env, goalId) {
  const { results } = await env.DB.prepare(
    `SELECT id, goal_id, body, category, author_user_id, author_name, created_at, updated_at
     FROM goal_notes WHERE goal_id = ?
     ORDER BY datetime(created_at) DESC`
  ).bind(goalId).all();
  return results || [];
}

/** One-time lift of the old single-field notes blob into the first line item. */
async function migrateLegacyNotes(env, goal) {
  const existing = await listNotes(env, goal.id);
  if (existing.length) return existing;
  const legacy = text(goal.notes, MAX_NOTE_BODY);
  if (!legacy) return existing;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO goal_notes
       (id, goal_id, body, category, author_user_id, author_name, created_at, updated_at)
     VALUES (?, ?, ?, 'general', ?, ?, ?, ?)`
  ).bind(
    id, goal.id, legacy,
    goal.owner_user_id || null, goal.owner_name || "",
    goal.created_at || now, goal.updated_at || now
  ).run();
  // Clear the blob so we don't re-import on every open.
  await env.DB.prepare(`UPDATE goals SET notes = '' WHERE id = ?`).bind(goal.id).run();
  return listNotes(env, goal.id);
}

async function countMetric(env, metric, start, end) {
  if (!start || !end) return 0;
  let sql = "";
  if (metric === "leads") {
    sql = `SELECT COUNT(*) AS n FROM leads WHERE date(created_at) >= ? AND date(created_at) <= ?`;
  } else if (metric === "deposits") {
    sql = `SELECT COUNT(*) AS n FROM install_payments
           WHERE status = 'received' AND kind = 'deposit'
             AND payment_date >= ? AND payment_date <= ?`;
  } else if (metric === "surveys") {
    sql = `SELECT COUNT(*) AS n FROM install_projects
           WHERE survey_date >= ? AND survey_date <= ? AND stage != 'cancelled'`;
  } else if (metric === "sold") {
    sql = `SELECT COUNT(*) AS n FROM leads
           WHERE stage = 'sold' AND date(updated_at) >= ? AND date(updated_at) <= ?`;
  } else {
    return null;
  }
  try {
    const row = await env.DB.prepare(sql).bind(start, end).first();
    return Number(row && row.n) || 0;
  } catch {
    return 0;
  }
}

// Manila, not UTC — a goal's days-remaining must not tick over at 08:00 PHT.
const todayIso = phToday;

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);
}

function enrich(goal, current) {
  const target = Math.max(1, Number(goal.target) || 1);
  const cur = Math.max(0, Number(current) || 0);
  const pct = Math.min(100, Math.round((cur / target) * 100));
  const today = todayIso();
  const total = Math.max(1, daysBetween(goal.start_date, goal.end_date) || 1);
  const elapsed = Math.max(0, Math.min(total, daysBetween(goal.start_date, today) || 0));
  const left = daysBetween(today, goal.end_date);
  const expected = target * (elapsed / total);
  const closed = goal.status === "Done" || goal.status === "Missed";
  let urgency = "ok";
  if (goal.status === "Done" || cur >= target) urgency = "hit";
  else if (goal.status === "Missed" || (left !== null && left < 0)) urgency = "miss";
  else if (left !== null && left <= 7 && cur < expected * 0.85) urgency = "risk";
  else if (cur < expected * 0.7 && elapsed > 2) urgency = "risk";
  return {
    ...goal,
    current: cur,
    pct,
    days_left: left,
    expected: Math.round(expected * 10) / 10,
    urgency,
    closed: closed || cur >= target,
  };
}

async function resolvePerson(env, userId) {
  if (!userId) return { id: null, name: "" };
  const row = await env.DB.prepare(
    `SELECT id, name, email FROM users WHERE id = ? AND active = 1`
  ).bind(userId).first();
  if (!row) return { id: null, name: "" };
  return { id: row.id, name: row.name || row.email || "" };
}

function cleanBody(body, existing) {
  const title = text(body.title !== undefined ? body.title : (existing && existing.title), MAX_TITLE);
  if (!title) return null;
  const start = date(body.start_date !== undefined ? body.start_date : (existing && existing.start_date));
  const end = date(body.end_date !== undefined ? body.end_date : (existing && existing.end_date));
  if (!start || !end || end < start) return null;
  const metric = METRICS.includes(body.metric) ? body.metric
    : (existing && METRICS.includes(existing.metric) ? existing.metric : "manual");
  const status = STATUSES.includes(body.status) ? body.status
    : (existing && STATUSES.includes(existing.status) ? existing.status : "Backlog");
  return {
    title,
    metric,
    target: Math.max(1, int(body.target !== undefined ? body.target : (existing && existing.target), 1)),
    current_manual: Math.max(0, int(
      body.current_manual !== undefined ? body.current_manual : (existing && existing.current_manual), 0
    )),
    start_date: start,
    end_date: end,
    status,
    notes: text(body.notes !== undefined ? body.notes : (existing && existing.notes), MAX_NOTES),
    assignee_user_id: body.assignee_user_id !== undefined
      ? (body.assignee_user_id ? int(body.assignee_user_id, null) : null)
      : (existing ? existing.assignee_user_id : null),
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = await currentUser(context);
  if (!user) return json({ ok: false, error: "Not authorized." }, 401);
  if (!env.DB) return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);
  await ensureSchema(env);

  if (request.method === "GET") {
    const url = new URL(request.url);
    const notesFor = text(url.searchParams.get("notes_for"), 80);
    if (notesFor) {
      const goal = await env.DB.prepare(`SELECT * FROM goals WHERE id = ?`).bind(notesFor).first();
      if (!goal) return json({ ok: false, error: "Goal not found." }, 404);
      const notes = await migrateLegacyNotes(env, goal);
      return json({ ok: true, notes });
    }

    const { results } = await env.DB.prepare(
      `SELECT id, title, metric, target, current_manual, start_date, end_date, status,
              owner_user_id, owner_name, assignee_user_id, assignee_name, notes,
              created_at, updated_at
       FROM goals ORDER BY
         CASE status WHEN 'Doing' THEN 1 WHEN 'This week' THEN 2 WHEN 'Backlog' THEN 3
                     WHEN 'Missed' THEN 4 ELSE 5 END,
         end_date ASC, datetime(created_at) DESC`
    ).all();
    const rows = results || [];
    const goals = [];
    for (const row of rows) {
      const auto = await countMetric(env, row.metric, row.start_date, row.end_date);
      const current = auto === null ? Number(row.current_manual) || 0 : auto;
      let notesCount = 0;
      try {
        const nc = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM goal_notes WHERE goal_id = ?`
        ).bind(row.id).first();
        notesCount = Number(nc && nc.n) || 0;
        if (!notesCount && text(row.notes, MAX_NOTE_BODY)) notesCount = 1;
      } catch { /* table may be mid-migrate */ }
      goals.push({ ...enrich(row, current), notes_count: notesCount });
    }
    const people = await env.DB.prepare(
      `SELECT id, name, email FROM users WHERE active = 1 ORDER BY name ASC, email ASC`
    ).all();
    return json({ ok: true, goals, people: people.results || [] });
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }

    if (body.resource === "note") {
      const goalId = text(body.goal_id, 80);
      if (!goalId) return json({ ok: false, error: "goal_id is required." }, 422);
      const goal = await env.DB.prepare(`SELECT id FROM goals WHERE id = ?`).bind(goalId).first();
      if (!goal) return json({ ok: false, error: "Goal not found." }, 404);
      const noteBody = text(body.body, MAX_NOTE_BODY);
      if (!noteBody) return json({ ok: false, error: "Note text is required." }, 422);
      const category = noteCategory(body.category);
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const authorName = user.name || user.email || "";
      await env.DB.prepare(
        `INSERT INTO goal_notes
           (id, goal_id, body, category, author_user_id, author_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, goalId, noteBody, category, user.id, authorName, now, now).run();
      return json({
        ok: true,
        note: {
          id, goal_id: goalId, body: noteBody, category,
          author_user_id: user.id, author_name: authorName,
          created_at: now, updated_at: now,
        },
      });
    }

    const clean = cleanBody(body, null);
    if (!clean) return json({ ok: false, error: "Title, start date and end date are required." }, 422);
    const assignee = await resolvePerson(env, clean.assignee_user_id);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO goals
         (id, title, metric, target, current_manual, start_date, end_date, status,
          owner_user_id, owner_name, assignee_user_id, assignee_name, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, clean.title, clean.metric, clean.target, clean.current_manual,
      clean.start_date, clean.end_date, clean.status,
      user.id, user.name || user.email || "",
      assignee.id, assignee.name, clean.notes, now, now
    ).run();
    const auto = await countMetric(env, clean.metric, clean.start_date, clean.end_date);
    const current = auto === null ? clean.current_manual : auto;
    return json({
      ok: true,
      goal: enrich({
        id, ...clean, owner_user_id: user.id, owner_name: user.name || user.email || "",
        assignee_user_id: assignee.id, assignee_name: assignee.name,
        created_at: now, updated_at: now, notes_count: 0,
      }, current),
    });
  }

  if (request.method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }

    if (body.resource === "note") {
      const id = text(body.id, 80);
      if (!id) return json({ ok: false, error: "A valid id is required." }, 422);
      const existing = await env.DB.prepare(`SELECT * FROM goal_notes WHERE id = ?`).bind(id).first();
      if (!existing) return json({ ok: false, error: "Note not found." }, 404);
      const noteBody = body.body !== undefined ? text(body.body, MAX_NOTE_BODY) : existing.body;
      if (!noteBody) return json({ ok: false, error: "Note text is required." }, 422);
      const category = body.category !== undefined ? noteCategory(body.category) : existing.category;
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE goal_notes SET body = ?, category = ?, updated_at = ? WHERE id = ?`
      ).bind(noteBody, category, now, id).run();
      return json({
        ok: true,
        note: {
          ...existing,
          body: noteBody,
          category,
          updated_at: now,
        },
      });
    }

    const id = text(body.id, 80);
    if (!id) return json({ ok: false, error: "A valid id is required." }, 422);
    const existing = await env.DB.prepare(`SELECT * FROM goals WHERE id = ?`).bind(id).first();
    if (!existing) return json({ ok: false, error: "Goal not found." }, 404);
    const clean = cleanBody(body, existing);
    if (!clean) return json({ ok: false, error: "Title, start date and end date are required." }, 422);
    let assigneeId = clean.assignee_user_id;
    let assigneeName = existing.assignee_name;
    if (body.assignee_user_id !== undefined) {
      const person = await resolvePerson(env, assigneeId);
      assigneeId = person.id;
      assigneeName = person.name;
    }
    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE goals SET title=?, metric=?, target=?, current_manual=?, start_date=?, end_date=?,
         status=?, assignee_user_id=?, assignee_name=?, notes=?, updated_at=?
       WHERE id=?`
    ).bind(
      clean.title, clean.metric, clean.target, clean.current_manual,
      clean.start_date, clean.end_date, clean.status,
      assigneeId, assigneeName, clean.notes, now, id
    ).run();
    return json({ ok: true });
  }

  if (request.method === "DELETE") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }

    if (body.resource === "note") {
      const id = text(body.id, 80);
      if (!id) return json({ ok: false, error: "A valid id is required." }, 422);
      const result = await env.DB.prepare(`DELETE FROM goal_notes WHERE id = ?`).bind(id).run();
      if (!result.meta || result.meta.changes === 0) return json({ ok: false, error: "Note not found." }, 404);
      return json({ ok: true });
    }

    const id = text(body.id, 80);
    if (!id) return json({ ok: false, error: "A valid id is required." }, 422);
    await env.DB.prepare(`DELETE FROM goal_notes WHERE goal_id = ?`).bind(id).run();
    const result = await env.DB.prepare(`DELETE FROM goals WHERE id = ?`).bind(id).run();
    if (!result.meta || result.meta.changes === 0) return json({ ok: false, error: "Goal not found." }, 404);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
