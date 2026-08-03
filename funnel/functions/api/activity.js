/**
 * GET /api/activity — the audit trail.
 *
 *   ?limit=100&before=<id>&user=<id>&action=<prefix>&kind=writes|access|all
 *   &q=<text>&days=<n>&summary=1
 *
 *   -> { ok, scope: "all" | "own", entries: [...], actors: [...], has_more,
 *        summary?: { total, last24h, people, failed_logins } }
 *
 * The master account sees every founder's activity and can filter by person,
 * action or free text. A founder sees only their own rows — enough to check their
 * own history, not enough to watch the team.
 *
 * Rows are written by functions/api/_middleware.js (every mutating API call) and by
 * the auth endpoints (logins, logouts, account admin).
 *
 * Two readers: /internal/team.html (the audit tab, table-shaped) and /internal/activity.html
 * (the Log — a feed of who changed what). The Log is why `kind` and `summary` exist: it
 * opens on writes only, and its counters have to be true for the whole filter rather than
 * for whichever page of rows happens to be on screen.
 */
import { currentUser, isMaster } from "../_auth.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Sign-in traffic vs. changes. `login`, `login_failed`, `login_blocked`, `logout` and
 * `section.denied` are access events; everything else records something that changed —
 * including `password_changed` and `users.create`, which are changes that happen to be
 * about accounts.
 */
const ACCESS_SQL = "(action LIKE 'login%' OR action = 'logout' OR action = 'section.denied')";

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

  // Who this account is allowed to see, with none of their chosen filters on top.
  // The failed-sign-in counter is measured against this rather than the filter, so it
  // still reports something when the feed is showing writes only.
  const scopeWhere = where.slice();
  const scopeBinds = binds.slice();

  // `_` and `%` are LIKE wildcards, and our own action names contain `_`
  // (login_failed) — escape them so a filter matches what it says it matches.
  const escapeLike = (value) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

  const action = String(params.get("action") || "").trim().slice(0, 60);
  if (action) {
    where.push("action LIKE ? ESCAPE '\\'");
    binds.push(`${escapeLike(action)}%`);
  }

  const kind = String(params.get("kind") || "").trim().toLowerCase();
  if (kind === "writes") where.push(`NOT ${ACCESS_SQL}`);
  else if (kind === "access") where.push(ACCESS_SQL);

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

  // The filter as the user set it, before pagination — the counters below have to
  // describe the whole result, not the page of it we are about to fetch.
  const filterClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const filterBinds = binds.slice();

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

  // The people picker on /internal/team.html and the Log — master only.
  let actors = [];
  if (master) {
    const { results: rows } = await env.DB.prepare(
      `SELECT id, name, email, role FROM users ORDER BY name COLLATE NOCASE`
    ).all();
    actors = rows || [];
  }

  const payload = { ok: true, scope: master ? "all" : "own", entries, actors, has_more: hasMore };

  if (params.get("summary")) {
    const scopeClause = scopeWhere.length ? `WHERE ${scopeWhere.join(" AND ")}` : "";
    payload.summary = await summarize(env, filterClause, filterBinds, scopeClause, scopeBinds);
  }

  return json(payload);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Counters for the Log's header strip.
 *
 * `total`, `people` and `last24h` run over the same WHERE as the feed (minus pagination),
 * so "412 events" and the list underneath can never disagree. `failed_logins` runs over
 * the account's scope only — it is a security readout, and measuring it through a
 * "writes only" filter would report a reassuring zero.
 *
 * `last24h` is a rolling window rather than "today": rows are stored in UTC and read in
 * PH time, and a rolling day needs no timezone guess.
 */
async function summarize(env, clause, binds, scopeClause, scopeBinds) {
  const and = (c) => (c ? `${c} AND` : "WHERE");
  try {
    const [totals, recent, failed] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS people FROM activity_log ${clause}`
      ).bind(...binds).first(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM activity_log ${and(clause)} created_at >= ?`
      ).bind(...binds, new Date(Date.now() - DAY_MS).toISOString()).first(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM activity_log ${and(scopeClause)} action = 'login_failed' AND created_at >= ?`
      ).bind(...scopeBinds, new Date(Date.now() - 7 * DAY_MS).toISOString()).first(),
    ]);
    return {
      total: Number(totals?.n || 0),
      people: Number(totals?.people || 0),
      last24h: Number(recent?.n || 0),
      failed_logins: Number(failed?.n || 0),
    };
  } catch {
    return null;
  }
}
