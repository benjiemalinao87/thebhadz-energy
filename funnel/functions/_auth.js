/**
 * Shared founder-auth helpers for Cloudflare Pages Functions.
 *
 * Session = a cookie `sc_founder` holding `<expiryMs>.<base64url(HMAC-SHA256(expiryMs, AUTH_SECRET))>`.
 * The signature can't be forged without AUTH_SECRET, so the middleware trusts a valid,
 * unexpired cookie. Constant-time comparison guards both the password and the signature.
 *
 * Required env:
 *   FOUNDER_PASSWORD — the shared founder password (secret).
 *   AUTH_SECRET      — random string used to sign session cookies (secret).
 */

export const COOKIE_NAME = "sc_founder";
export const SESSION_MS = 1000 * 60 * 60 * 12; // 12 hours

const enc = new TextEncoder();

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

/** Create a signed session token valid for SESSION_MS from now. */
export async function makeToken(secret) {
  const expiry = Date.now() + SESSION_MS;
  const sig = await hmac(String(expiry), secret);
  return `${expiry}.${sig}`;
}

/** Verify a session token: correct signature and not expired. */
export async function verifyToken(token, secret) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const idx = token.indexOf(".");
  const expiryStr = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  const expected = await hmac(expiryStr, secret);
  return safeEqual(sig, expected);
}

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
