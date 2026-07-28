/**
 * POST /api/founder-login
 *   { "email": "...", "password": "..." }   → that founder's own account
 *   { "password": "..." }                   → the shared team password (no email)
 *
 * Personal login verifies the password against that user's PBKDF2 hash, opens a
 * server-side session, and returns their name/role so the UI can greet them (and
 * reveal master-only tools).
 *
 * Shared login (FOUNDER_PASSWORD) still works, and deliberately goes through the same
 * machinery: it signs in as the shared-login account (env SHARED_LOGIN_EMAIL), which is
 * an ordinary founder row the master can disable, with a session that can be revoked.
 * Its activity is logged as "Shared team login" because there is no person to name.
 * Unset FOUNDER_PASSWORD to turn shared access off entirely.
 *
 * Failure handling: wrong passwords are counted and logged, but never lock an account —
 * a founder mistyping their password must never be shut out of their own tools. An
 * unknown email and a wrong password answer identically, so the form can't be used to
 * enumerate who has an account.
 */
import {
  bootstrapMaster,
  createSession,
  ensureAuthSchema,
  ensureSharedAccount,
  isSharedLogin,
  isValidEmail,
  logActivity,
  normalizeEmail,
  pruneExpired,
  publicUser,
  recordFailedLogin,
  recordSuccessfulLogin,
  safeEqual,
  sessionCookie,
  sharedLoginEnabled,
  verifyPassword,
} from "../_auth.js";

const GENERIC_FAILURE = "Incorrect email or password.";
const SHARED_FAILURE = "Incorrect shared team password.";

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(extraHeaders || {}) },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }

  // Misconfiguration guard — better a clear 500 than a silently-open door.
  if (!env.AUTH_SECRET) {
    return json({ ok: false, error: "Login is not configured. Set AUTH_SECRET." }, 500);
  }
  if (!env.DB) {
    return json({ ok: false, error: "Login is not configured (bind D1 as DB)." }, 500);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const email = normalizeEmail(data && data.email);
  const password = data && data.password ? String(data.password) : "";
  if (!password) return json({ ok: false, error: "Password is required." }, 400);

  // No email means "I'm using the shared team password" — as does typing the shared
  // address itself, since that account has no password of its own.
  const wantsShared = !email || isSharedLogin(email, env);
  if (!wantsShared && !isValidEmail(email)) return json({ ok: false, error: GENERIC_FAILURE }, 401);

  try {
    await ensureAuthSchema(env);
    const seeded = await bootstrapMaster(env);
    if (seeded === "missing_seed_password" && !wantsShared) {
      return json(
        {
          ok: false,
          error:
            "No accounts exist yet and no seed password is set. Set MASTER_PASSWORD in Cloudflare, then sign in as the master account.",
        },
        500
      );
    }
  } catch {
    return json({ ok: false, error: "Could not reach the accounts database." }, 500);
  }

  if (wantsShared) return sharedLogin(context, password);

  const row = await env.DB.prepare(
    `SELECT id, email, name, role, password_hash, active, must_change, failed_count,
            last_login_at, created_by, created_at, updated_at
     FROM users WHERE email = ?`
  )
    .bind(email)
    .first();

  if (!row) {
    await logActivity(env, {
      action: "login_failed",
      entity: "auth",
      actorEmail: email,
      status: 401,
      detail: "No account with that email",
      request,
    });
    return json({ ok: false, error: GENERIC_FAILURE }, 401);
  }

  // The shared account's password lives in the environment, not in this row, so a
  // personal-style login against it can never succeed — say so instead of failing dryly.
  if (isSharedLogin(row, env)) {
    return json(
      {
        ok: false,
        error: sharedLoginEnabled(env)
          ? "That is the shared team login. Leave the email blank and enter the shared team password."
          : "Shared team access is switched off. Sign in with your own email and password.",
      },
      401
    );
  }

  if (!(await verifyPassword(password, row.password_hash))) {
    const { failed } = await recordFailedLogin(env, row);
    await logActivity(env, {
      action: "login_failed",
      entity: "auth",
      user: publicUser(row),
      status: 401,
      detail: `Wrong password (attempt ${failed})`,
      request,
    });
    return json({ ok: false, error: GENERIC_FAILURE }, 401);
  }

  // Only tell the right password holder that their account is switched off. Checking
  // `active` before the password would let anyone probe which emails have accounts.
  if (Number(row.active) !== 1) {
    await logActivity(env, {
      action: "login_blocked",
      entity: "auth",
      user: publicUser(row),
      status: 403,
      detail: "Correct password on a disabled account",
      request,
    });
    return json({ ok: false, error: "This account is disabled. Ask the master account to re-enable it." }, 403);
  }

  const user = publicUser(row);
  const token = await createSession(env, user, request);
  await recordSuccessfulLogin(env, row);
  await logActivity(env, { action: "login", entity: "auth", user, status: 200, request });

  // Housekeeping is cheap, and login is the natural moment for it.
  try {
    await pruneExpired(env);
  } catch {
    /* non-fatal */
  }

  return json({ ok: true, user }, 200, { "Set-Cookie": sessionCookie(token) });
}

/**
 * Sign in with the shared team password (FOUNDER_PASSWORD).
 *
 * Same session machinery as a personal login — the only difference is which account it
 * lands on, and that the password is compared against the environment rather than a
 * stored hash (constant-time, as before).
 */
async function sharedLogin(context, password) {
  const { request, env } = context;

  if (!sharedLoginEnabled(env)) {
    await logActivity(env, {
      action: "login_failed",
      entity: "auth",
      actorEmail: "(shared)",
      status: 401,
      detail: "Shared login attempted while FOUNDER_PASSWORD is unset",
      request,
    });
    return json(
      { ok: false, error: "Shared team access is switched off. Sign in with your own email and password." },
      401
    );
  }

  const row = await ensureSharedAccount(env);

  if (!safeEqual(password, env.FOUNDER_PASSWORD)) {
    const { failed } = await recordFailedLogin(env, row);
    await logActivity(env, {
      action: "login_failed",
      entity: "auth",
      user: publicUser(row),
      status: 401,
      detail: `Wrong shared password (attempt ${failed})`,
      request,
    });
    return json({ ok: false, error: SHARED_FAILURE }, 401);
  }

  // The master can switch shared access off from Team & access without touching secrets.
  if (Number(row.active) !== 1) {
    await logActivity(env, {
      action: "login_blocked",
      entity: "auth",
      user: publicUser(row),
      status: 403,
      detail: "Shared login is disabled",
      request,
    });
    return json(
      { ok: false, error: "Shared team access has been switched off. Sign in with your own email and password." },
      403
    );
  }

  const user = publicUser(row);
  const token = await createSession(env, user, request);
  await recordSuccessfulLogin(env, row);
  await logActivity(env, {
    action: "login",
    entity: "auth",
    user,
    status: 200,
    detail: "Shared team password — not attributable to a person",
    request,
  });

  try {
    await pruneExpired(env);
  } catch {
    /* non-fatal */
  }

  return json({ ok: true, user, shared: true }, 200, { "Set-Cookie": sessionCookie(token) });
}
