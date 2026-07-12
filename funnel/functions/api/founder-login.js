/**
 * POST /api/founder-login  — { "password": "..." }
 *
 * Verifies the password against FOUNDER_PASSWORD (constant-time) and, on success,
 * issues a signed session cookie that the /internal gate accepts. On failure, 401.
 */
import { makeToken, sessionCookie, safeEqual } from "../_auth.js";

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }

  // Misconfiguration guard — better a clear 500 than a silently-open door.
  if (!env.FOUNDER_PASSWORD || !env.AUTH_SECRET) {
    return json(
      { ok: false, error: "Login is not configured. Set FOUNDER_PASSWORD and AUTH_SECRET." },
      500
    );
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const password = (data && data.password ? String(data.password) : "");
  if (!password) return json({ ok: false, error: "Password required." }, 400);

  if (!safeEqual(password, env.FOUNDER_PASSWORD)) {
    return json({ ok: false, error: "Incorrect password." }, 401);
  }

  const token = await makeToken(env.AUTH_SECRET);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token) });
}
