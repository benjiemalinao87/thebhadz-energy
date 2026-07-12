/**
 * Gate for everything under /internal/*.
 *
 * Runs before the static internal docs are served. If the request carries a valid,
 * unexpired founder session cookie, it passes through (context.next()). Otherwise it
 * redirects to /login.html?next=<the requested path>, so the docs files are never
 * served to an unauthenticated visitor.
 *
 * If AUTH_SECRET is unset (misconfiguration), fail closed — redirect to login.
 */
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  const token = getCookie(request, COOKIE_NAME);
  const ok = env.AUTH_SECRET ? await verifyToken(token, env.AUTH_SECRET) : false;

  if (ok) {
    // Authenticated — serve the requested internal asset, but keep it out of caches/indexes.
    const res = await next();
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(res.body, { status: res.status, headers });
  }

  const nextParam = encodeURIComponent(url.pathname + url.search);
  return Response.redirect(`${url.origin}/login.html?next=${nextParam}`, 302);
}
