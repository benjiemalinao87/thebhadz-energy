/**
 * GET or POST /api/founder-logout — ends the session server-side (so the cookie is
 * dead even if a copy of it survives somewhere), clears it, logs the event, and
 * redirects to the public site.
 */
import { COOKIE_NAME, clearCookie, destroySession, getCookie, logActivity, resolveSession } from "../_auth.js";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Read who it was before the session row disappears, so the log line has a name.
  let user = null;
  try {
    const session = await resolveSession(request, env);
    user = session ? session.user : null;
  } catch {
    /* signed out already */
  }

  await destroySession(env, getCookie(request, COOKIE_NAME));
  if (user) await logActivity(env, { action: "logout", entity: "auth", user, status: 302, request });

  return new Response(null, {
    status: 302,
    headers: { Location: `${url.origin}/`, "Set-Cookie": clearCookie(), "Cache-Control": "no-store" },
  });
}
