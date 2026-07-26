/**
 * Gate for everything under /internal/*.
 *
 * Runs before the static internal docs are served. If the request carries a valid,
 * unexpired session belonging to an ACTIVE founder account, it passes through
 * (context.next()). Otherwise it redirects to /login.html?next=<the requested path>,
 * so the docs files are never served to an unauthenticated visitor.
 *
 * Page access is the same for every founder; what differs by role is what the APIs
 * behind the pages return (see functions/api/users.js and activity.js — master only).
 * Failing closed is deliberate: no AUTH_SECRET or no reachable database means
 * redirect to login, never serve.
 */
import { resolveSession } from "../_auth.js";

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  let session = null;
  try {
    session = await resolveSession(request, env);
  } catch {
    session = null; // misconfiguration or database trouble — treat as signed out
  }

  if (session) {
    // Authenticated — serve the requested internal asset, but keep it out of
    // caches/indexes.
    const res = await next();
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(res.body, { status: res.status, headers });
  }

  const nextParam = encodeURIComponent(url.pathname + url.search);
  return Response.redirect(`${url.origin}/login.html?next=${nextParam}`, 302);
}
