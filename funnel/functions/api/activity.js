/**
 * GET /api/activity — the audit trail.
 *
 *   ?limit=100&before=<id>&user=<id>&action=<prefix>&q=<text>&days=<n>
 *
 *   -> { ok, scope: "all" | "own", entries: [...], actors: [...], has_more }
 *
 * The master account sees every founder's activity and can filter by person,
 * action or free text. A founder sees only their own rows — enough to check their
 * own history, not enough to watch the team.
 *
 * Rows are written by functions/api/_middleware.js (every mutating API call) and by
 * the auth endpoints (logins, logouts, account admin).
 */
import { currentUser, isMaster } from "../_auth.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  const user = await currentUser(context);
  if (!user) return json({ ok: false, error: "Not authorized." }, 401);
  if (!env.DB) return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);
  if (request.method !== "GET") return json({ ok: false, error: "Method not allowed." }, 405);

  const params = new URL(request.url).searchParams;
  const master = isMaster(user);

  const where = [];
  const binds = [];

  // A founder is pinned to their own rows regardless of what they ask for.
  if (!master) {
    where.push("user_id = ?");
    binds.push(user.id);
  } else if (params.get("user")) {
    where.push("user_id = ?");
    binds.push(String(params.get("user")).slice(0, 80));
  }

  // `_` and `%` are LIKE wildcards, and our own action names contain `_`
  // (login_failed) — escape them so a filter matches what it says it matches.
  const escapeLike = (value) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

  const action = String(params.get("action") || "").trim().slice(0, 60);
  if (action) {
    where.push("action LIKE ? ESCAPE '\\'");
    binds.push(`${escapeLike(action)}%`);
  }

  const q = String(params.get("q") || "").trim().slice(0, 80);
  if (q) {
    where.push(
      `(detail LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\' OR actor_email LIKE ? ESCAPE '\\'
        OR actor_name LIKE ? ESCAPE '\\' OR entity LIKE ? ESCAPE '\\')`
    );
    const like = `%${escapeLike(q)}%`;
    binds.push(like, like, like, like, like);
  }

  const days = Number(params.get("days"));
  if (Number.isFinite(days) && days > 0) {
    where.push("created_at >= ?");
    binds.push(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
  }

  // Keyset pagination on the autoincrement id — stable while new rows arrive.
  const before = Number(params.get("before"));
  if (Number.isFinite(before) && before > 0) {
    where.push("id < ?");
    binds.push(Math.round(before));
  }

  let limit = Number(params.get("limit"));
  limit = Number.isFinite(limit) ? Math.min(MAX_LIMIT, Math.max(1, Math.round(limit))) : DEFAULT_LIMIT;

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  let results = [];
  try {
    const query = await env.DB.prepare(
      `SELECT id, user_id, actor_email, actor_name, action, entity, entity_id,
              method, path, status, detail, ip, created_at
       FROM activity_log ${clause}
       ORDER BY id DESC LIMIT ?`
    )
      .bind(...binds, limit + 1)
      .all();
    results = query.results || [];
  } catch {
    // Table not created yet (fresh database, nobody has signed in since deploy).
    return json({ ok: true, scope: master ? "all" : "own", entries: [], actors: [], has_more: false });
  }

  const hasMore = results.length > limit;
  const entries = hasMore ? results.slice(0, limit) : results;

  // The people picker on /internal/team.html — master only.
  let actors = [];
  if (master) {
    const { results: rows } = await env.DB.prepare(
      `SELECT id, name, email, role FROM users ORDER BY name COLLATE NOCASE`
    ).all();
    actors = rows || [];
  }

  return json({ ok: true, scope: master ? "all" : "own", entries, actors, has_more: hasMore });
}
