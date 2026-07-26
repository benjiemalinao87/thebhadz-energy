/**
 * /api/session — who am I, and self-service for my own account.
 *
 *   GET                                                  -> { ok, user, master_email }
 *   POST { action: "change_password", current_password, new_password }
 *   POST { action: "update_name", name }
 *
 * Every founder may use this on their own account only — nothing here can touch
 * anyone else's login. Account administration lives in /api/users (master only).
 *
 * A password change closes every OTHER session for that account, so a shared or
 * borrowed browser stops being a way in.
 */
import {
  currentSessionId,
  currentUser,
  destroyUserSessions,
  hashPassword,
  isSharedLogin,
  logActivity,
  masterEmail,
  passwordProblem,
  verifyPassword,
} from "../_auth.js";

const MAX_NAME = 80;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  const user = await currentUser(context);
  if (!user) return json({ ok: false, error: "Not signed in." }, 401);
  if (!env.DB) return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);

  const shared = isSharedLogin(user, env);

  if (request.method === "GET") {
    return json({ ok: true, user, master_email: masterEmail(env), shared });
  }

  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON." }, 400);
  }

  const action = String((body && body.action) || "");

  // Nothing here belongs to a person when signed in with the shared password, and
  // "changing your password" would silently do nothing to FOUNDER_PASSWORD.
  if (shared) {
    return json(
      {
        ok: false,
        error:
          "You are signed in with the shared team password, so there is no personal account to change. Sign in with your own email to manage your login.",
      },
      403
    );
  }

  if (action === "change_password") {
    const currentPassword = String(body.current_password || "");
    const newPassword = String(body.new_password || "");
    if (!currentPassword || !newPassword) {
      return json({ ok: false, error: "Current and new password are both required." }, 422);
    }

    const row = await env.DB.prepare(`SELECT password_hash FROM users WHERE id = ?`).bind(user.id).first();
    if (!row) return json({ ok: false, error: "Account not found." }, 404);

    if (!(await verifyPassword(currentPassword, row.password_hash))) {
      await logActivity(env, {
        action: "password_change_failed",
        entity: "users",
        entityId: user.id,
        user,
        status: 401,
        detail: "Current password did not match",
        request,
      });
      return json({ ok: false, error: "Current password is incorrect." }, 401);
    }
    if (await verifyPassword(newPassword, row.password_hash)) {
      return json({ ok: false, error: "New password must be different from the current one." }, 422);
    }

    const problem = passwordProblem(newPassword);
    if (problem) return json({ ok: false, error: problem }, 422);

    await env.DB.prepare(
      `UPDATE users SET password_hash = ?, must_change = 0, failed_count = 0, locked_until = NULL, updated_at = ?
       WHERE id = ?`
    )
      .bind(await hashPassword(newPassword, env), new Date().toISOString(), user.id)
      .run();

    // Keep this browser signed in; drop every other session for the account.
    await destroyUserSessions(env, user.id, currentSessionId(context));

    await logActivity(env, {
      action: "password_changed",
      entity: "users",
      entityId: user.id,
      user,
      status: 200,
      detail: "Own password changed; other sessions signed out",
      request,
    });
    return json({ ok: true, user: { ...user, must_change: false } });
  }

  if (action === "update_name") {
    const name = String(body.name || "").trim().slice(0, MAX_NAME);
    if (!name) return json({ ok: false, error: "Name is required." }, 422);
    await env.DB.prepare(`UPDATE users SET name = ?, updated_at = ? WHERE id = ?`)
      .bind(name, new Date().toISOString(), user.id)
      .run();
    await logActivity(env, {
      action: "profile_updated",
      entity: "users",
      entityId: user.id,
      user,
      status: 200,
      detail: `Display name → ${name}`,
      request,
    });
    return json({ ok: true, user: { ...user, name } });
  }

  return json({ ok: false, error: "Unknown action." }, 422);
}
