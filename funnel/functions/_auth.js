/**
 * Founder identity for the Command Center — one account per founder.
 *
 * How a request is authenticated
 * ------------------------------
 *   cookie `sc_founder` = `<sessionId>.<base64url(HMAC-SHA256(sessionId, AUTH_SECRET))>`
 *
 * The signature makes the cookie unforgeable, so a bad cookie is rejected without
 * touching the database. A well-signed cookie is then looked up in `user_sessions`
 * (D1) and joined to its `users` row. Sessions are therefore *revocable*: deleting
 * or deactivating an account, or changing its password, kills every open session on
 * the next request — which a self-contained signed-payload cookie could not do.
 *
 * Roles
 * -----
 *   master   — the default for every founder account: all tools, the whole team's
 *              activity log, and account administration (create / edit / disable /
 *              delete). The founders are equals, so there is no single owner account.
 *   founder  — a deliberately limited login: all tools, but only its own activity and
 *              no account administration. Use it for a bookkeeper, an assistant, or a
 *              contractor — not for a founder.
 *
 * Two rules keep "everyone is master" from being able to break itself: there is always
 * at least one active master, and the shared team login can never hold the role (see
 * below — whoever knew the shared password would inherit account administration).
 *
 * The shared team password
 * ------------------------
 * FOUNDER_PASSWORD still works as a login. It does NOT bypass any of the above: it
 * signs you in as one real, ordinary account — the shared login (env
 * SHARED_LOGIN_EMAIL, default team@macc-inc.com) — whose row the master can disable
 * from Team & access, and whose sessions are revocable like anyone else's.
 *
 * What it costs, stated plainly: everything done through it is logged as "Shared team
 * login", not as a person. It can never hold the master role, and it has no stored
 * password of its own (the env var IS its password), so it cannot be reset or renamed
 * into someone's personal account.
 *
 * Passwords are PBKDF2-SHA256 with a per-user salt, stored as
 * `pbkdf2-sha256$<iterations>$<salt>$<hash>`. The iteration count lives inside the
 * string, so raising or lowering PASSWORD_ITERATIONS never invalidates old hashes.
 *
 * Required env:
 *   AUTH_SECRET         — random string signing session cookies (secret).
 *   DB                  — D1 binding holding users / user_sessions / activity_log.
 * Optional env:
 *   MASTER_EMAIL        — bootstrap address: the account seeded ONLY when the users
 *                         table is completely empty (default benjiemalinao87@gmail.com).
 *                         It gets no special powers or protection afterwards.
 *   MASTER_PASSWORD     — password for that bootstrap account, used once at creation.
 *   FOUNDER_PASSWORD    — the shared team password. Unset it to switch shared login off.
 *   SHARED_LOGIN_EMAIL  — identity the shared password signs in as (default team@macc-inc.com).
 *   PASSWORD_ITERATIONS — PBKDF2 rounds for NEW hashes (default 100000). Lower it
 *                         (e.g. 25000) if the Workers Free 10ms CPU limit bites at login.
 */

import { parseHiddenPages } from "./_pages.js";

export const COOKIE_NAME = "sc_founder";
export const SESSION_MS = 1000 * 60 * 60 * 12; // 12 hours
export const DEFAULT_MASTER_EMAIL = "benjiemalinao87@gmail.com";
export const DEFAULT_SHARED_EMAIL = "team@macc-inc.com";
export const SHARED_LOGIN_NAME = "Shared team login";
// The shared account authenticates against env.FOUNDER_PASSWORD, so its stored hash is
// deliberately unusable: verifyPassword() rejects anything without the pbkdf2 prefix.
export const SHARED_PASSWORD_SENTINEL = "shared-login:env-FOUNDER_PASSWORD";

const DEFAULT_ITERATIONS = 100000;
const MIN_ITERATIONS = 10000;
const MAX_ITERATIONS = 600000;
const KEY_BITS = 256;
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 200;
const LOCK_AFTER_FAILURES = 8;
// The shared login is the whole team's way in, so locking it after 8 guesses would let
// one stranger shut everyone out. A higher bar still stops sustained guessing.
const SHARED_LOCK_AFTER_FAILURES = 20;
const LOCK_MS = 1000 * 60 * 15; // 15 minutes
const TOUCH_SESSION_MS = 1000 * 60 * 5; // don't rewrite last_seen_at more often than this
const ACTIVITY_KEEP_DAYS = 180;

const enc = new TextEncoder();

/* ── encoding + primitives ────────────────────────────────────────────────── */

function b64url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64url(sig);
}

/** Timing-safe string equality. */
export function safeEqual(a, b) {
  const ba = enc.encode(String(a));
  const bb = enc.encode(String(b));
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

function randomId(bytes = 24) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function nowIso() {
  return new Date().toISOString();
}

/* ── passwords ────────────────────────────────────────────────────────────── */

function iterationsFrom(env) {
  const raw = Number(env && env.PASSWORD_ITERATIONS);
  if (!Number.isFinite(raw)) return DEFAULT_ITERATIONS;
  return Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, Math.round(raw)));
}

async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    key,
    KEY_BITS
  );
  return b64url(bits);
}

function saltBytesFrom(b64) {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Hash a password for storage. Returns `pbkdf2-sha256$<iters>$<salt>$<hash>`. */
export async function hashPassword(password, env) {
  const iterations = iterationsFrom(env);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(String(password), salt, iterations);
  return `pbkdf2-sha256$${iterations}$${b64url(salt)}$${hash}`;
}

/** Check a password against a stored hash string. */
export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  let hash;
  try {
    hash = await pbkdf2(String(password), saltBytesFrom(parts[2]), iterations);
  } catch {
    return false;
  }
  return safeEqual(hash, parts[3]);
}

/**
 * Why a password is unacceptable, or null if it's fine.
 * Deliberately minimal: length plus the obvious guesses. This tool holds customer
 * names, phones and money, so the floor is a real one, not a 6-character PIN.
 */
export function passwordProblem(password) {
  const value = String(password || "");
  if (value.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (value.length > MAX_PASSWORD) return "Password is too long.";
  if (/^\s|\s$/.test(value)) return "Password cannot start or end with a space.";
  const weak = ["password", "12345678", "qwerty", "solarcity", "solarcity2026", "letmein", "changeme"];
  const flat = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (weak.indexOf(flat) !== -1) return "That password is too easy to guess. Choose another.";
  return null;
}

/* ── email + user shaping ─────────────────────────────────────────────────── */

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 160);
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || ""));
}

/**
 * The address seeded when the accounts table is empty. Not a privileged identity —
 * once real accounts exist this address is as ordinary as any other, and deleting it
 * is permanent (bootstrapMaster only fires on a completely empty table).
 */
export function bootstrapEmail(env) {
  return normalizeEmail((env && env.MASTER_EMAIL) || DEFAULT_MASTER_EMAIL);
}

/** The address the shared team password signs in as. */
export function sharedLoginEmail(env) {
  return normalizeEmail((env && env.SHARED_LOGIN_EMAIL) || DEFAULT_SHARED_EMAIL);
}

/** Shared login is available only while a shared password is configured. */
export function sharedLoginEnabled(env) {
  return !!(env && env.FOUNDER_PASSWORD);
}

/** Is this user (or email) the shared team login rather than a person? */
export function isSharedLogin(userOrEmail, env) {
  const email = typeof userOrEmail === "string" ? normalizeEmail(userOrEmail) : userOrEmail && userOrEmail.email;
  return !!email && email === sharedLoginEmail(env);
}

export function isMaster(user) {
  return !!user && user.role === "master";
}

/** The subset of a user row that is safe to send to the browser. */
export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: Number(row.active) === 1,
    must_change: Number(row.must_change) === 1,
    hidden_pages: parseHiddenPages(row.hidden_pages),
    mailbox: row.mailbox || null,
    last_login_at: row.last_login_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by || null,
  };
}

/* ── schema + bootstrap ───────────────────────────────────────────────────── */

/**
 * Create the three auth tables if they're missing (mirrors funnel/schema.sql).
 * Cheap and idempotent, and it means a deploy can't lock the team out because
 * the schema file wasn't applied to D1 yet.
 */
export async function ensureAuthSchema(env) {
  if (!env.DB) throw new Error("Database not configured (bind D1 as DB).");
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS users (
         id TEXT PRIMARY KEY,
         email TEXT NOT NULL UNIQUE,
         name TEXT NOT NULL,
         role TEXT NOT NULL DEFAULT 'founder' CHECK (role IN ('master','founder')),
         password_hash TEXT NOT NULL,
         active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
         must_change INTEGER NOT NULL DEFAULT 0 CHECK (must_change IN (0,1)),
         failed_count INTEGER NOT NULL DEFAULT 0,
         locked_until TEXT,
         last_login_at TEXT,
         hidden_pages TEXT NOT NULL DEFAULT '[]',
         created_by TEXT,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS user_sessions (
         id TEXT PRIMARY KEY,
         user_id TEXT NOT NULL,
         created_at TEXT NOT NULL,
         expires_at TEXT NOT NULL,
         last_seen_at TEXT NOT NULL,
         ip TEXT,
         user_agent TEXT
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS activity_log (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id TEXT,
         actor_email TEXT NOT NULL DEFAULT '',
         actor_name TEXT NOT NULL DEFAULT '',
         action TEXT NOT NULL,
         entity TEXT NOT NULL DEFAULT '',
         entity_id TEXT NOT NULL DEFAULT '',
         method TEXT NOT NULL DEFAULT '',
         path TEXT NOT NULL DEFAULT '',
         status INTEGER,
         detail TEXT NOT NULL DEFAULT '',
         ip TEXT,
         user_agent TEXT,
         created_at TEXT NOT NULL
       )`
    ),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id)`),
  ]);

  // Migrations for databases created before newer columns. SQLite has no
  // ADD COLUMN IF NOT EXISTS, and a failing statement aborts a batch, so each runs
  // on its own and treats "duplicate column" as success.
  const migrations = [
    `ALTER TABLE users ADD COLUMN hidden_pages TEXT NOT NULL DEFAULT '[]'`,
    // Per-founder personal mailbox address (see schema.sql).
    `ALTER TABLE users ADD COLUMN mailbox TEXT`,
  ];
  for (const sql of migrations) {
    try {
      await env.DB.prepare(sql).run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error && error.message))) throw error;
    }
  }
}

/**
 * Seed the very first master account, so a fresh database has a way in.
 *
 * Fires ONLY when there are no accounts at all. That matters: the founders are all
 * masters and may delete any account, including this bootstrap address, and a deleted
 * account must stay deleted rather than reappear at the next sign-in.
 */
export async function bootstrapMaster(env) {
  const anyUser = await env.DB.prepare(`SELECT id FROM users LIMIT 1`).first();
  if (anyUser) return "";

  const email = bootstrapEmail(env);
  const seed = String(env.MASTER_PASSWORD || env.FOUNDER_PASSWORD || "");
  if (!seed) return "missing_seed_password";

  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, role, password_hash, active, must_change, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'master', ?, 1, ?, 'bootstrap', ?, ?)`
  )
    .bind(
      randomId(12),
      email,
      "Benjie Malinao",
      await hashPassword(seed, env),
      passwordProblem(seed) ? 1 : 0, // a weak seed must be changed at first login
      now,
      now
    )
    .run();
  return "seeded_master";
}

/**
 * Fetch the shared-login row, creating it the first time the shared password is used.
 *
 * It is an ordinary `founder` row — same sessions, same audit trail, same revocation —
 * with two differences: its stored hash is unusable (the env var is its password), and
 * `users.js` refuses to promote, delete, re-email or re-password it.
 */
export async function ensureSharedAccount(env) {
  const email = sharedLoginEmail(env);
  const existing = await env.DB.prepare(
    `SELECT id, email, name, role, password_hash, active, must_change, failed_count,
            locked_until, last_login_at, created_by, created_at, updated_at
     FROM users WHERE email = ?`
  )
    .bind(email)
    .first();

  if (existing) {
    // A shared login must never be able to administer accounts.
    if (existing.role !== "founder") {
      await env.DB.prepare(`UPDATE users SET role = 'founder', updated_at = ? WHERE id = ?`)
        .bind(nowIso(), existing.id)
        .run();
      existing.role = "founder";
    }
    return existing;
  }

  const now = nowIso();
  const id = randomId(12);
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, role, password_hash, active, must_change, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'founder', ?, 1, 0, 'shared-login', ?, ?)`
  )
    .bind(id, email, SHARED_LOGIN_NAME, SHARED_PASSWORD_SENTINEL, now, now)
    .run();

  return {
    id,
    email,
    name: SHARED_LOGIN_NAME,
    role: "founder",
    password_hash: SHARED_PASSWORD_SENTINEL,
    active: 1,
    must_change: 0,
    failed_count: 0,
    locked_until: null,
    last_login_at: null,
    created_by: "shared-login",
    created_at: now,
    updated_at: now,
  };
}

/* ── sessions ─────────────────────────────────────────────────────────────── */

/** Read a named cookie from the request. */
export function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const parts = header.split(";");
  for (let i = 0; i < parts.length; i++) {
    const [k, ...v] = parts[i].trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** Build the Set-Cookie header value for the session. */
export function sessionCookie(token) {
  const maxAge = Math.floor(SESSION_MS / 1000);
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/** Build a Set-Cookie header value that clears the session. */
export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "";
}

function userAgent(request) {
  return String(request.headers.get("User-Agent") || "").slice(0, 300);
}

/** Open a session for a user and return the cookie token. */
export async function createSession(env, user, request) {
  const id = randomId(24);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO user_sessions (id, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      user.id,
      new Date(now).toISOString(),
      new Date(now + SESSION_MS).toISOString(),
      new Date(now).toISOString(),
      clientIp(request),
      userAgent(request)
    )
    .run();
  return `${id}.${await hmac(id, env.AUTH_SECRET)}`;
}

/** Split and verify the cookie signature. Returns the session id, or null. */
async function sessionIdFromToken(token, secret) {
  if (!token || typeof token !== "string") return null;
  const idx = token.indexOf(".");
  if (idx <= 0) return null;
  const id = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null;
  const expected = await hmac(id, secret);
  return safeEqual(sig, expected) ? id : null;
}

/** Delete the session behind a cookie token. Returns the session id it removed. */
export async function destroySession(env, token) {
  if (!env.AUTH_SECRET || !env.DB) return null;
  const id = await sessionIdFromToken(token, env.AUTH_SECRET);
  if (!id) return null;
  try {
    await env.DB.prepare(`DELETE FROM user_sessions WHERE id = ?`).bind(id).run();
  } catch {
    /* table missing — nothing to revoke */
  }
  return id;
}

/** Log a user out everywhere (optionally keeping the session in use right now). */
export async function destroyUserSessions(env, userId, keepSessionId) {
  if (keepSessionId) {
    await env.DB.prepare(`DELETE FROM user_sessions WHERE user_id = ? AND id != ?`)
      .bind(userId, keepSessionId)
      .run();
    return;
  }
  await env.DB.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).bind(userId).run();
}

/**
 * Resolve the signed-in user for a request: `{ user, sessionId }` or null.
 * Rejects expired sessions and disabled accounts, and slides the expiry forward
 * while someone is actively working.
 */
export async function resolveSession(request, env) {
  if (!env.AUTH_SECRET || !env.DB) return null;

  const id = await sessionIdFromToken(getCookie(request, COOKIE_NAME), env.AUTH_SECRET);
  if (!id) return null;

  const sessionQuery = () =>
    env.DB.prepare(
      `SELECT s.id AS session_id, s.expires_at, s.last_seen_at,
              u.id, u.email, u.name, u.role, u.active, u.must_change, u.hidden_pages,
              u.mailbox, u.last_login_at, u.created_by, u.created_at, u.updated_at
       FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
      .bind(id)
      .first();

  let row;
  try {
    row = await sessionQuery();
  } catch {
    // Missing table, or a column this code selects that predates the deployed
    // database (e.g. users.mailbox). Run the idempotent schema pass and retry once,
    // so a schema-widening deploy doesn't sign every open session out; if it still
    // fails, treat as signed out rather than 500 the whole site.
    try {
      await ensureAuthSchema(env);
      row = await sessionQuery();
    } catch {
      return null;
    }
  }
  if (!row) return null;

  const now = Date.now();
  if (Date.parse(row.expires_at) <= now) {
    await env.DB.prepare(`DELETE FROM user_sessions WHERE id = ?`).bind(id).run();
    return null;
  }
  if (Number(row.active) !== 1) {
    await env.DB.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).bind(row.id).run();
    return null;
  }
  // Removing the FOUNDER_PASSWORD secret is a kill switch, so it must end sessions
  // already open on the shared login too — not merely block the next sign-in.
  if (isSharedLogin(row, env) && !sharedLoginEnabled(env)) {
    await env.DB.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).bind(row.id).run();
    return null;
  }

  const lastSeen = Date.parse(row.last_seen_at) || 0;
  if (now - lastSeen > TOUCH_SESSION_MS) {
    await env.DB.prepare(`UPDATE user_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`)
      .bind(new Date(now).toISOString(), new Date(now + SESSION_MS).toISOString(), id)
      .run();
  }

  return { user: publicUser(row), sessionId: row.session_id };
}

/**
 * The signed-in user for this Pages Functions request, or null.
 * Memoized on `context.data` so the middleware and the endpoint behind it share
 * one database lookup.
 */
export async function currentUser(context) {
  const { request, env } = context;
  if (context.data && context.data.user !== undefined) return context.data.user;
  const session = await resolveSession(request, env);
  if (context.data) {
    context.data.user = session ? session.user : null;
    context.data.sessionId = session ? session.sessionId : null;
  }
  return session ? session.user : null;
}

/** Current session id (set alongside context.data.user by currentUser). */
export function currentSessionId(context) {
  return (context.data && context.data.sessionId) || null;
}

/* ── login attempt bookkeeping ────────────────────────────────────────────── */

export const SHARED_LOCK_LIMIT = SHARED_LOCK_AFTER_FAILURES;

export function lockRemainingMs(row) {
  if (!row || !row.locked_until) return 0;
  return Math.max(0, Date.parse(row.locked_until) - Date.now());
}

export async function recordFailedLogin(env, row, limit) {
  const threshold = Number.isFinite(limit) ? limit : LOCK_AFTER_FAILURES;
  const failed = Number(row.failed_count || 0) + 1;
  const lockedUntil = failed >= threshold ? new Date(Date.now() + LOCK_MS).toISOString() : null;
  await env.DB.prepare(`UPDATE users SET failed_count = ?, locked_until = ?, updated_at = ? WHERE id = ?`)
    .bind(failed, lockedUntil, nowIso(), row.id)
    .run();
  return { failed, lockedUntil };
}

export async function recordSuccessfulLogin(env, row) {
  const now = nowIso();
  await env.DB.prepare(
    `UPDATE users SET failed_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?`
  )
    .bind(now, now, row.id)
    .run();
}

/** Housekeeping on login: drop dead sessions and stale audit rows. */
export async function pruneExpired(env) {
  const cutoff = new Date(Date.now() - ACTIVITY_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM user_sessions WHERE expires_at < ?`).bind(nowIso()),
    env.DB.prepare(`DELETE FROM activity_log WHERE created_at < ?`).bind(cutoff),
  ]);
}

/* ── activity log ─────────────────────────────────────────────────────────── */

/**
 * Append one row to the audit trail. Never throws: a missing log line must not
 * turn a working action into an error the founder sees.
 */
export async function logActivity(env, entry) {
  if (!env.DB) return;
  const e = entry || {};
  const user = e.user || null;
  const request = e.request || null;
  try {
    await env.DB.prepare(
      `INSERT INTO activity_log
         (user_id, actor_email, actor_name, action, entity, entity_id,
          method, path, status, detail, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        user ? user.id : null,
        String(e.actorEmail || (user && user.email) || "").slice(0, 160),
        String(e.actorName || (user && user.name) || "").slice(0, 120),
        String(e.action || "unknown").slice(0, 60),
        String(e.entity || "").slice(0, 40),
        String(e.entityId || "").slice(0, 80),
        String(e.method || (request ? request.method : "")).slice(0, 10),
        String(e.path || (request ? new URL(request.url).pathname : "")).slice(0, 160),
        Number.isFinite(Number(e.status)) ? Number(e.status) : null,
        String(e.detail || "").slice(0, 400),
        request ? clientIp(request) : String(e.ip || ""),
        request ? userAgent(request) : String(e.userAgent || ""),
        nowIso()
      )
      .run();
  } catch {
    /* audit write failed (e.g. table missing) — ignore */
  }
}
