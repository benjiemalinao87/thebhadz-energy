/**
 * GET or POST /api/founder-logout — clears the founder session cookie and
 * redirects to the public site.
 */
import { clearCookie } from "../_auth.js";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: { Location: `${url.origin}/`, "Set-Cookie": clearCookie() },
  });
}
