/**
 * /api/users — founder accounts. Any MASTER may administer them, and master is the
 * default role for a founder: the founders are equals, with no single owner account.
 *
 *   GET                                                    -> { ok, users: [...] }
 *   POST   { name, email, password, role? }                 -> create an account
 *   PATCH  { id, name?, email?, role?, active?, password?, mailbox? } -> edit an account
 *          (mailbox = the founder's personal @macc-inc.com address for /internal/mail;
 *           empty string removes it)
 *   DELETE { id }                                           -> delete an account
 *
 * Guard rails (all enforced here, not in the browser):
 *   - there is always at least one active master, so the team can't lock itself out
 *     of account administration;
 *   - you cannot delete or disable the account you are signed in as (delete someone
 *     else's, or have them do it, so there's always a live session to fix mistakes);
 *   - the shared team login (env SHARED_LOGIN_EMAIL) can be renamed and disabled —
 *     disabling it is how you switch shared access off — but never promoted to master,
 *     given a stored password, re-emailed, or deleted. Its password is FOUNDER_PASSWORD,
 *     and a shared string must never carry account administration;
 *   - a new or reset password must clear passwordProblem(), and resetting one signs
 *     that founder out of every device.
 *
 * Deliberately NOT guarded: every founder can edit or delete every other founder's
 * account. That is what equal owners means — the audit trail, not a permission wall,
 * is what makes it accountable.
 *
 * Every call writes its own activity_log row (the generic logger in
 * functions/api/_middleware.js skips this path) so account changes read as
 * "Benjie created Jethro's account", not "POST /api/users".
 */
import {
  currentSessionId,
  currentUser,
  destroyUserSessions,
  ensureAuthSchema,
  hashPassword,
  isMaster,
  isValidEmail,
  logActivity,
  normalizeEmail,
  passwordProblem,
  publicUser,
  sharedLoginEmail,
  sharedLoginEnabled,
} from "../_auth.js";
import { normalizeHiddenPages, parseHiddenPages, sectionsForClient } from "../_pages.js";

const MAX_NAME = 80;
const ROLES = ["master", "founder"];

// Personal mailboxes live on macc-inc.com — the zone with Email Sending enabled
// zone-wide, so the address can both receive (via an Email Routing rule to the
// hello-fanout Worker) and appear in From. Addresses the company already uses as
// shared identities can never become someone's private mailbox.
const MAILBOX_DOMAIN = "macc-inc.com";
const RESERVED_MAILBOXES = [
  "official@macc-inc.com",
  "alternate@macc-inc.com",
  "quote@macc-inc.com",
  "team@macc-inc.com",
];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function activeMasterCount(env, exceptId) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM users WHERE role = 'master' AND active = 1 AND id != ?`
  )
    .bind(exceptId || "")
    .first();
  return Number((row && row.n) || 0);
}

export async function onRequest(context) {
  const { request, env } = context;

  const actor = await currentUser(context);
  if (!actor) return json({ ok: false, error: "Not authorized." }, 401);
  if (!isMaster(actor)) {
    // Worth a log line: a founder reaching for account administration is either
    // confused or probing, and the master should be able to see which.
    await logActivity(env, {
      action: "users.denied",
      entity: "users",
      user: actor,
      status: 403,
      detail: `Non-master attempted ${request.method} /api/users`,
      request,
    });
    return json({ ok: false, error: "Only the master account can manage founder logins." }, 403);
  }
  if (!env.DB) return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);

  await ensureAuthSchema(env);
  const shared = sharedLoginEmail(env);

  /* ── list ──────────────────────────────────────────────────────────────── */
  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.role, u.active, u.must_change, u.locked_until,
              u.failed_count, u.last_login_at, u.hidden_pages, u.mailbox,
              u.created_by, u.created_at, u.updated_at,
              (SELECT COUNT(*) FROM user_sessions s
                WHERE s.user_id = u.id AND s.expires_at > ?) AS open_sessions
       FROM users u
       ORDER BY CASE u.role WHEN 'master' THEN 0 ELSE 1 END, u.name COLLATE NOCASE`
    )
      .bind(new Date().toISOString())
      .all();

    const users = (results || []).map((row) => ({
      ...publicUser(row),
      locked_until: row.locked_until || null,
      failed_count: Number(row.failed_count || 0),
      open_sessions: Number(row.open_sessions || 0),
      is_shared_login: row.email === shared,
      is_self: row.id === actor.id,
    }));
    return json({
      ok: true,
      users,
      sections: sectionsForClient(),
      shared_email: shared,
      shared_enabled: sharedLoginEnabled(env),
    });
  }

  /* ── create ────────────────────────────────────────────────────────────── */
  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON." }, 400);
    }

    const name = String(body.name || "").trim().slice(0, MAX_NAME);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    // A new account is a founder unless told otherwise, and founders are masters.
    const role = ROLES.includes(body.role) ? body.role : "master";

    if (!name) return json({ ok: false, error: "Name is required." }, 422);
    if (!isValidEmail(email)) return json({ ok: false, error: "A valid email address is required." }, 422);
    if (email === shared) {
      return json(
        { ok: false, error: `${shared} is the shared team login. It is created automatically and has no personal password.` },
        422
      );
    }
    const problem = passwordProblem(password);
    if (problem) return json({ ok: false, error: problem }, 422);

    const clash = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
    if (clash) return json({ ok: false, error: "An account with that email already exists." }, 409);

    const hidden = normalizeHiddenPages(body.hidden_pages);
    const now = new Date().toISOString();
    const id = randomId();
    await env.DB.prepare(
      `INSERT INTO users (id, email, name, role, password_hash, active, must_change, hidden_pages, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`
    )
      .bind(id, email, name, role, await hashPassword(password, env), JSON.stringify(hidden), actor.email, now, now)
      .run();

    await logActivity(env, {
      action: "users.create",
      entity: "users",
      entityId: id,
      user: actor,
      status: 200,
      detail:
        `Created ${role === "master" ? "founder" : "limited"} account for ${name} <${email}>` +
        (hidden.length ? ` · hidden: ${hidden.join(", ")}` : ""),
      request,
    });
    return json({
      ok: true,
      user: {
        id,
        email,
        name,
        role,
        active: true,
        must_change: true,
        hidden_pages: hidden,
        created_at: now,
        updated_at: now,
        created_by: actor.email,
      },
    });
  }

  /* ── edit ──────────────────────────────────────────────────────────────── */
  if (request.method === "PATCH") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON." }, 400);
    }

    const id = String(body.id || "").trim();
    if (!id) return json({ ok: false, error: "A user id is required." }, 422);

    const target = await env.DB.prepare(
      `SELECT id, email, name, role, active, hidden_pages, mailbox FROM users WHERE id = ?`
    )
      .bind(id)
      .first();
    if (!target) return json({ ok: false, error: "Account not found." }, 404);

    const targetIsSharedLogin = target.email === shared;
    const sets = [];
    const binds = [];
    const changes = [];
    let revokeSessions = false;

    if (typeof body.name === "string") {
      const name = body.name.trim().slice(0, MAX_NAME);
      if (!name) return json({ ok: false, error: "Name is required." }, 422);
      if (name !== target.name) {
        sets.push("name = ?");
        binds.push(name);
        changes.push(`name → ${name}`);
      }
    }

    if (typeof body.email === "string") {
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) return json({ ok: false, error: "A valid email address is required." }, 422);
      if (email !== target.email) {
        if (targetIsSharedLogin) {
          return json(
            { ok: false, error: `The shared login address (${shared}) is set by SHARED_LOGIN_EMAIL, not here.` },
            422
          );
        }
        if (email === shared) {
          return json({ ok: false, error: `${shared} is reserved for the shared team login.` }, 422);
        }
        const clash = await env.DB.prepare(`SELECT id FROM users WHERE email = ? AND id != ?`).bind(email, id).first();
        if (clash) return json({ ok: false, error: "Another account already uses that email." }, 409);
        sets.push("email = ?");
        binds.push(email);
        changes.push(`email → ${email}`);
        revokeSessions = true; // the login identity changed
      }
    }

    if (typeof body.role === "string") {
      if (!ROLES.includes(body.role)) return json({ ok: false, error: "Unknown role." }, 422);
      if (body.role !== target.role) {
        // Whoever knows the shared password would inherit account admin. Never.
        if (targetIsSharedLogin) {
          return json(
            { ok: false, error: "The shared team login cannot change role — anyone with the shared password would inherit it." },
            422
          );
        }
        if (target.role === "master" && body.role !== "master" && (await activeMasterCount(env, id)) === 0) {
          return json({ ok: false, error: "There must always be one active master account." }, 422);
        }
        sets.push("role = ?");
        binds.push(body.role);
        changes.push(`role → ${body.role}`);
      }
    }

    if (body.active !== undefined) {
      const active = body.active ? 1 : 0;
      if (active !== Number(target.active)) {
        if (!active && target.id === actor.id) {
          return json({ ok: false, error: "You cannot disable the account you are signed in with." }, 422);
        }
        if (!active && target.role === "master" && (await activeMasterCount(env, id)) === 0) {
          return json({ ok: false, error: "There must always be one active master account." }, 422);
        }
        sets.push("active = ?");
        binds.push(active);
        changes.push(active ? "re-enabled" : "disabled");
        if (!active) revokeSessions = true;
      }
    }

    if (body.password !== undefined) {
      const password = String(body.password || "");
      if (targetIsSharedLogin) {
        return json(
          {
            ok: false,
            error:
              "The shared login's password is the FOUNDER_PASSWORD secret in Cloudflare. Rotate it there, or disable shared access here.",
          },
          422
        );
      }
      const problem = passwordProblem(password);
      if (problem) return json({ ok: false, error: problem }, 422);
      sets.push("password_hash = ?");
      binds.push(await hashPassword(password, env));
      // A reset password is a temporary one: make them set their own on first use.
      sets.push("must_change = ?");
      binds.push(target.id === actor.id ? 0 : 1);
      changes.push("password reset");
      revokeSessions = true;
    }

    if (typeof body.mailbox === "string") {
      const mailbox = normalizeEmail(body.mailbox);
      if (mailbox !== String(target.mailbox || "")) {
        if (targetIsSharedLogin) {
          return json(
            { ok: false, error: "The shared team login uses the shared company mailbox — it cannot have a personal one." },
            422
          );
        }
        if (!mailbox) {
          sets.push("mailbox = NULL");
          changes.push("personal mailbox removed");
        } else {
          if (!isValidEmail(mailbox) || !mailbox.endsWith("@" + MAILBOX_DOMAIN)) {
            return json({ ok: false, error: `A personal mailbox must be an address @${MAILBOX_DOMAIN}.` }, 422);
          }
          if (RESERVED_MAILBOXES.includes(mailbox)) {
            return json({ ok: false, error: `${mailbox} is a shared company address and cannot be a personal mailbox.` }, 422);
          }
          const taken = await env.DB.prepare(`SELECT id FROM users WHERE mailbox = ? AND id != ?`)
            .bind(mailbox, id)
            .first();
          if (taken) return json({ ok: false, error: "Another account already owns that mailbox address." }, 409);
          sets.push("mailbox = ?");
          binds.push(mailbox);
          changes.push(`personal mailbox → ${mailbox}`);
        }
      }
    }

    if (body.hidden_pages !== undefined) {
      const hidden = normalizeHiddenPages(body.hidden_pages);
      const before = parseHiddenPages(target.hidden_pages);
      if (hidden.join(",") !== before.join(",")) {
        sets.push("hidden_pages = ?");
        binds.push(JSON.stringify(hidden));
        changes.push(hidden.length ? `sections hidden: ${hidden.join(", ")}` : "all sections visible");
      }
    }

    if (body.unlock) {
      sets.push("failed_count = 0", "locked_until = NULL");
      changes.push("unlocked");
    }

    if (!sets.length) return json({ ok: false, error: "Nothing to update." }, 422);

    sets.push("updated_at = ?");
    binds.push(new Date().toISOString());
    binds.push(id);
    await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();

    // Password resets / disables / identity changes must not leave live sessions
    // behind. Keep the master's own current session when they reset themselves.
    if (revokeSessions) {
      await destroyUserSessions(env, id, target.id === actor.id ? currentSessionId(context) : null);
    }

    await logActivity(env, {
      action: "users.update",
      entity: "users",
      entityId: id,
      user: actor,
      status: 200,
      detail: `${target.name} <${target.email}>: ${changes.join(", ")}`,
      request,
    });
    return json({ ok: true, revoked_sessions: revokeSessions });
  }

  /* ── delete ────────────────────────────────────────────────────────────── */
  if (request.method === "DELETE") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON." }, 400);
    }

    const id = String(body.id || "").trim();
    if (!id) return json({ ok: false, error: "A user id is required." }, 422);
    if (id === actor.id) return json({ ok: false, error: "You cannot delete your own account." }, 422);

    const target = await env.DB.prepare(`SELECT id, email, name, role FROM users WHERE id = ?`).bind(id).first();
    if (!target) return json({ ok: false, error: "Account not found." }, 404);
    // Deleting it would only make the next shared sign-in recreate it, quietly undoing
    // what you meant. Disabling is the switch that actually holds.
    if (target.email === shared) {
      return json(
        { ok: false, error: "Use Disable to switch shared team access off — the shared login cannot be deleted." },
        422
      );
    }
    if (target.role === "master" && (await activeMasterCount(env, id)) === 0) {
      return json({ ok: false, error: "There must always be one active master account." }, 422);
    }

    await env.DB.batch([
      env.DB.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).bind(id),
      env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id),
    ]);

    // The activity rows stay — the audit trail outlives the account. user_id now
    // points at nothing, which is why each row also stores the actor's email/name.
    await logActivity(env, {
      action: "users.delete",
      entity: "users",
      entityId: id,
      user: actor,
      status: 200,
      detail: `Deleted account ${target.name} <${target.email}> (${target.role})`,
      request,
    });
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
