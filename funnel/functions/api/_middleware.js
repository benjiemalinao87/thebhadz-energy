/**
 * Gate + audit trail for everything under /api/*.
 *
 * Two jobs:
 *   1. Authenticate once per request and hand the resolved founder to the endpoint
 *      behind it via `context.data.user` (see _auth.js → currentUser). Endpoints
 *      still check for themselves, so this is defence in depth, not their only lock.
 *   2. Record every mutating call in `activity_log` — who, what, which record,
 *      which HTTP status. That is what the master account reads on
 *      /internal/team.html, and it happens here so no endpoint can forget to log.
 *
 * PUBLIC_PATHS are the only routes that skip authentication: the funnel's own lead
 * form and the login/logout endpoints themselves.
 */
import { currentUser, logActivity } from "../_auth.js";
import { isSectionHidden, sectionForApi } from "../_pages.js";

const PUBLIC_PATHS = new Set(["/api/lead", "/api/founder-login", "/api/founder-logout"]);

// These endpoints write their own, richer audit rows (which account was created,
// whose password was reset), so the generic logger stays out of their way.
const SELF_LOGGED = new Set(["/api/users", "/api/session", "/api/founder-login", "/api/founder-logout"]);

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const VERBS = { POST: "create", PATCH: "update", PUT: "replace", DELETE: "delete" };
const MAX_SNIFF_BYTES = 4096; // only peek at small JSON bodies, never at uploads

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** `/api/install-ops` → `install-ops`. */
function resourceOf(pathname) {
  return pathname.replace(/^\/api\//, "").replace(/\/.*$/, "") || "api";
}

/**
 * A short "what was touched" line for the activity feed.
 *
 * Small JSON bodies are read from a clone so the endpoint still gets its own
 * unread body. Multipart uploads (receipts, recordings) and anything large are
 * skipped — buffering a 40 MB video to write a log line would be absurd.
 */
async function describe(request) {
  const url = new URL(request.url);
  const query = url.search ? url.search.slice(1) : "";
  const type = request.headers.get("Content-Type") || "";
  const length = Number(request.headers.get("Content-Length") || 0);

  let id = "";
  let bits = [];
  if (type.includes("multipart/form-data")) {
    // Can't name the file without buffering it; size and type still tell the story.
    bits.push(`upload · ${length ? Math.max(1, Math.round(length / 1024)) + " KB" : "unknown size"}`);
  } else if (type.includes("application/json") && length > 0 && length <= MAX_SNIFF_BYTES) {
    try {
      const body = await request.clone().json();
      if (body && typeof body === "object") {
        id = String(body.id || body.key || "").slice(0, 80);
        for (const field of ["resource", "action", "title", "name", "customer_name", "stage", "status", "subject"]) {
          if (typeof body[field] === "string" && body[field]) bits.push(`${field}=${body[field].slice(0, 60)}`);
        }
      }
    } catch {
      /* not parseable — fall back to the query string alone */
    }
  }
  if (query) bits.unshift(query.slice(0, 100));
  return { id, detail: bits.join(" · ").slice(0, 400) };
}

export async function onRequest(context) {
  const { request, env, next, waitUntil } = context;
  const pathname = new URL(request.url).pathname;

  if (PUBLIC_PATHS.has(pathname)) return next();

  const user = await currentUser(context);
  if (!user) {
    return json({ ok: false, error: "Not authorized. Sign in again." }, 401);
  }

  // A hidden section's data has to be unreachable, not just unlinked — otherwise
  // hiding Finance from an installer stops at the sidebar and /api/finance still pays out.
  const section = sectionForApi(pathname);
  if (section && isSectionHidden(user, section.key)) {
    if (typeof waitUntil === "function") {
      waitUntil(
        logActivity(env, {
          user,
          action: "section.denied",
          entity: section.key,
          method: request.method,
          path: pathname,
          status: 403,
          detail: `${section.label} is hidden from this account`,
          request,
        })
      );
    }
    return json({ ok: false, error: "That section is not available on your account." }, 403);
  }

  const shouldLog = MUTATING.has(request.method) && !SELF_LOGGED.has(pathname);
  const described = shouldLog ? await describe(request) : null;

  const response = await next();

  if (shouldLog) {
    const entry = {
      user,
      action: `${resourceOf(pathname)}.${VERBS[request.method] || request.method.toLowerCase()}`,
      entity: resourceOf(pathname),
      entityId: described.id,
      method: request.method,
      path: pathname,
      status: response.status,
      detail: described.detail,
      request,
    };
    // Don't make the founder wait on the audit write.
    if (typeof waitUntil === "function") waitUntil(logActivity(env, entry));
    else await logActivity(env, entry);
  }

  return response;
}
